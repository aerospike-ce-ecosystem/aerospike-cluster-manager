# Aerospike Cluster Manager — Set/Record Note 기능 설계

> **DEPRECATED**: 이 문서는 MCP 툴 레이어 기준으로 작성된 working/scratch 설계 노트입니다.
> MCP 서버는 제거되었고(ackoctl CLI가 동등 기능을 제공), MCP 관련 동사/툴 언급은 더 이상 유효하지 않습니다.
> 노트 기능 자체는 REST API (`/api/v1/notes`) 로 살아 있으며 그 부분만 참조용으로 유지합니다.
>
> Status: FINAL — 사용자 결정 반영 완료 (네이밍=`note`, 스코프=connection, record=userKey only)

## Context

Aerospike Community Edition은 set/record 단위로 사람이 읽는 메타정보(예: "이 set은 airflow `feature_pipeline_v4` DAG에서 hourly로 적재", "이 record는 staging A/B 테스트용 sentinel")를 붙일 방법이 없다. 카탈로그/거버넌스가 부족한 게 CE의 알려진 약점인데, 이를 cluster-manager의 metaDB(SQLite/PG)에 별도 저장하고 read 시 join 해서 보여주면 운영자가 "이 set이 뭐 하는 거였더라" 같은 일상적인 질문을 코드를 뒤지지 않고 해결할 수 있다.

**제약**:
- Aerospike에 쓸 수 없으므로 cluster-manager metaDB에만 살아 있다 → 클러스터 자체의 진실의 원천(SoT)은 아님
- Connection은 workspace에 종속 (PR #307) → 노트를 connection_id에 묶으면 ACL은 transitively workspace로 보호됨
- Random 50 read는 검색 불가 → 노트가 있는데 50건에 안 걸리면 "있는데 못 보는" 상황 발생

---

## 확정된 결정사항

| 항목 | 결정 | 비고 |
|------|------|------|
| 필드 이름 | **`note`** | "운영자 메모" 의미가 또렷, set/record/connection 모두 통일 |
| 저장 단위 | **connection 스코프** | connection 삭제 시 cascade. 같은 클러스터 재등록 시 노트는 새 connection에 안 따라감 (의도된 동작) |
| Record 식별 | **userKey 있는 record만** (1차) | digest-only(send-key=false) record는 후속 |
| API | **하이브리드** | 읽기 인라인 + 쓰기/검색 분리 |
| 기존 `connection.description` | **`connection.note` 로 rename** (이번 PR에 포함) | 전 시스템 네이밍 통일. Breaking change지만 alias 없이 깔끔하게 절단 |

---

## 1. 네이밍 정리

선택: **`note`** (set/record 양쪽 모두). `db_comment`는 폐기.

폐기 근거:
- **"db"가 오해 유발**: 데이터는 Aerospike DB에 안 들어가고 cluster-manager metaDB에 산다 → 사용자는 "Aerospike DB의 comment 기능"으로 오해 가능 (그런 기능은 영원히 없음)
- **"comment"는 MySQL DDL 비유**: MySQL `COMMENT ON COLUMN`은 스키마에 박히는 정의. 여기는 그게 아니라 **운영자 메모**에 가깝다.

`note` 채택 효과:
- Pydantic: `SetInfo.note: str | None`, `AerospikeRecord.note: str | None`
- Connection의 `description`과는 분리된 컨셉 (connection은 "프로파일 설명", set/record는 "운영 메모") — 의미상 분리가 오히려 자연스러움
- MCP 툴 동사: `update_set_note`, `update_record_note`, `delete_*_note`, `list_*_notes`

---

## 2. 스키마 설계

### Connection 스코프 채택의 의미
- `connection_id`가 외래키 → connection 삭제 시 노트도 cascade 삭제
- Connection은 이미 `workspaceId`에 종속되므로 ACL은 **자동으로 transitively workspace 격리**됨 (`_assert_workspace_owns_arg(conn_id)` 게이팅 그대로 작동)
- 같은 Aerospike 클러스터를 두 connection으로 등록하면 노트는 분리됨 (재등록은 곧 fresh start)

### 새 테이블

```sql
-- Set-level notes
CREATE TABLE set_notes (
    connection_id TEXT NOT NULL,
    namespace     TEXT NOT NULL,
    set_name      TEXT NOT NULL,            -- Aerospike set name (max 63 chars)
    note          TEXT NOT NULL,            -- free text (empty=delete row)
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    updated_by    TEXT,                     -- OIDC sub claim; null in anonymous/bearer mode
    PRIMARY KEY (connection_id, namespace, set_name),
    FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
);
CREATE INDEX idx_set_notes_conn_ns ON set_notes(connection_id, namespace);

-- Record-level notes (userKey only — 1차 릴리스)
CREATE TABLE record_notes (
    connection_id TEXT NOT NULL,
    namespace     TEXT NOT NULL,
    set_name      TEXT NOT NULL,
    pk_text       TEXT NOT NULL,            -- string-encoded primary key (matches API wire form)
    pk_type       TEXT NOT NULL DEFAULT 'string',  -- 'string'|'int'|'bytes' (round-trip fidelity)
    digest_hex    TEXT,                     -- optional, 40-char hex; verification only, NOT in PK
    note          TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    updated_by    TEXT,
    PRIMARY KEY (connection_id, namespace, set_name, pk_text, pk_type),
    FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
);
CREATE INDEX idx_rec_notes_conn_ns_set ON record_notes(connection_id, namespace, set_name);
-- 50건 batch read 시 (connection_id, namespace, set_name) prefix + pk_text IN (...) 쿼리에 최적
```

### PK 설계 노트
- `(pk_text, pk_type)` 둘 다 PK에 포함하는 이유: `pk_text="42"`이면서 `pk_type="string"`인 record와 `pk_type="int"`인 record는 Aerospike에서 **다른 record** (digest가 다름). 둘 다 노트가 가능해야 한다.
- `digest_hex`는 PK가 아니라 verification용 — 같은 (set, pk_text, pk_type)에 대해 결정적이므로 stale detection (드물지만)에 쓸 수 있고, 미래에 digest-only record 지원 시 컬럼 재활용 가능.

### Cascade
- `connections.id` → ON DELETE CASCADE
- Workspace 삭제 시: workspace → connection cascade → 노트 cascade (chain으로 자동 정리)

### 마이그레이션
`_sqlite.py:71-127`, `_postgres.py:68-106`의 기존 `migrate()` 함수에 `CREATE TABLE IF NOT EXISTS set_notes (...)` / `CREATE TABLE IF NOT EXISTS record_notes (...)` 추가. 버전 트래킹 없는 기존 idempotent 관행 그대로.

### 알려진 제한 (1차 릴리스)
- **digest-only record (send-key=false) 미지원**: pk_text가 빈 문자열인 record는 노트 불가 → API 레벨에서 400 Bad Request로 거절
- **Same-cluster 노트 공유 안 됨**: 같은 클러스터를 connection A/B로 등록하면 A에서 만든 노트가 B에서 안 보임 (사용자가 connection 스코프를 의도적으로 선택한 결과)

---

## 3. API 설계 — 하이브리드

사용자 고민: "기존 read API에 합칠지, 별도 CRUD API + UI 비동기 2개 호출할지"

**답: 둘 다. 역할이 다름.**

### Read 측: 기존 API에 인라인 포함 (opt-in 아님)

| 기존 endpoint | 변경 |
|---|---|
| `GET /clusters/{conn_id}` (응답에 SetInfo[]) | `SetInfo.note: str \| None` 자동 포함 |
| `GET /records/{conn_id}` (data browser, ~50건) | 각 `AerospikeRecord.note: str \| None` 자동 포함 (단일 batch SQL) |
| `GET /records/{conn_id}/detail` (단일 record) | `AerospikeRecord.note` 자동 포함 |

근거:
- **단일 source of truth**: UI가 "노트 별도 호출"을 까먹을 일 없음
- **Single round-trip**: 50건 record 응답 시 metaDB SQL 한 번 — `SELECT pk_text, pk_type, note FROM record_notes WHERE connection_id=? AND namespace=? AND set_name=? AND pk_text IN (?,?,...)` → N+1 아님
- **하위 호환**: NULL이면 null 그대로, optional 필드 → 기존 클라이언트 영향 없음
- **MCP 자동 활용**: 기존 `get_record`, `list_records`, `get_cluster_info` 툴이 note를 자연스럽게 포함 (응답 모델만 확장)

### Write/Search 측: 분리된 CRUD API

```
# Set notes
PUT    /api/notes/sets/{conn_id}/{ns}/{set}            body: {note: string}
DELETE /api/notes/sets/{conn_id}/{ns}/{set}
GET    /api/notes/sets/{conn_id}                       → 해당 connection의 set 노트 전체 list
GET    /api/notes/sets/{conn_id}?namespace={ns}        → namespace 한정

# Record notes
PUT    /api/notes/records/{conn_id}/{ns}/{set}/{pk}    body: {note: string, pk_type?: 'auto'|'string'|'int'|'bytes'}
DELETE /api/notes/records/{conn_id}/{ns}/{set}/{pk}    query: pk_type
GET    /api/notes/records/{conn_id}?ns=&set=           → 노트 있는 record pk 전체 list (random-50 사각지대 해법)
```

근거:
- **CRUD는 read와 라이프사이클이 다르다**: 노트 수정이 record 갱신에 묶일 이유 없음
- **MCP 툴 발견성**: `update_record_note`, `delete_set_note` 같은 동사형 툴이 따로 노출되면 MCP가 찾고 쓰기 쉬움
- **검색 가능성**: `GET /api/notes/records/{conn_id}?ns=&set=`가 노트 있는 record pk 전체 반환 → UI에서 "노트 있는 record만 보기" 필터 → **사용자가 우려한 "random 50에 안 걸리면 못 본다" 문제 해결**

### Upsert/Delete 동작
- `PUT note=""` → 행 삭제 (DELETE와 동일, idempotent)
- `PUT note="..."` → upsert (`INSERT ... ON CONFLICT DO UPDATE` / SQLite는 `INSERT OR REPLACE`)
- 동시성: `updated_at` 기반 optimistic locking은 1차 릴리스 생략 — last-write-wins로 충분 (노트는 실시간 협업 대상 아님)

---

## 4. MCP 툴 — "MCP가 이걸 잘 쓰게 하고 싶다"

`mcp/tools/notes.py` 신규 모듈에 `@tool(category="note", mutation=...)` 등록.

| Tool | 시그니처 | mutation |
|------|----------|----------|
| `update_set_note` | `(conn_id, namespace, set_name, note)` | True |
| `delete_set_note` | `(conn_id, namespace, set_name)` | True |
| `list_set_notes` | `(conn_id, namespace?)` → `[{ns, set, note, updated_at, updated_by}]` | False |
| `update_record_note` | `(conn_id, namespace, set_name, pk, note, pk_type='auto')` | True |
| `delete_record_note` | `(conn_id, namespace, set_name, pk, pk_type='auto')` | True |
| `list_record_notes` | `(conn_id, namespace, set_name)` → `[{pk, pk_type, note, updated_at, updated_by}]` | False |

기존 `get_record`, `list_records`, `get_cluster_info` 툴은 응답 Pydantic 모델에 `note` 필드만 추가되면 `model_dump()` 통해 자동 노출 → **별도 변경 불필요**.

`_assert_workspace_owns_arg(conn_id)` (mcp/registry.py:124-197)가 `conn_id`를 보고 caller workspace의 connection 인지 검증 → **추가 ACL 코드 불필요**.

### MCP 사용 시나리오 예시 (사용자가 들었던 `feature_v4_pctr` 케이스)
```
1. user: "feature_v4_pctr set이 뭐야?"
2. MCP → list_records(conn_id=..., ns=test, set=feature_v4_pctr)
   → 50건 + 각 record.note 인라인 (있으면 표시)
3. MCP → 응답 set 메타에 SetInfo.note 포함 ("airflow feature_pipeline_v4 DAG hourly 적재")
   → LLM이 사용자에게 "이 set은 ... 용도입니다" 답변
4. user: "이 record에 'staging A/B sentinel' 메모 남겨줘"
5. MCP → update_record_note(conn_id, ns, set, pk, "staging A/B sentinel")
```

---

## 5. 변경할 파일 (스케치)

### 0. Connection.description → Connection.note rename (선행 작업)
이 작업을 먼저 수행해야 새 set/record note 코드와 네이밍이 충돌 없음.

- `models/connection.py` — `ConnectionProfile.description` → `note`, `CreateConnectionRequest.description` → `note`, `UpdateConnectionRequest.description` → `note` (라인 54, 83, 101 부근)
- `db/_base.py` — `row_to_profile()`에서 `row["description"]` → `row["note"]` (라인 105)
- `db/_sqlite.py` — 마이그레이션에 idempotent rename 추가:
  ```sql
  -- PRAGMA table_info(connections) 검사 후 'note' 없으면 ALTER TABLE connections RENAME COLUMN description TO note;
  -- (SQLite 3.25+, 모든 지원 환경 OK)
  ```
  + `create_connection()`/`update_connection()` SQL 의 칼럼명 교체 (라인 207-274)
  + `build_merged_profile()` 의 description → note (있다면)
- `db/_postgres.py` — `ALTER TABLE connections RENAME COLUMN description TO note;` (idempotent: information_schema 체크 후)
  + 동일하게 CRUD SQL 칼럼명 교체
- `routers/connections.py` — request/response body 처리 (라인 50-104, 138 model_dump)
- `mcp/tools/connections.py` — `description` 파라미터 → `note` (라인 60, 108 등 8개 툴 시그니처)
- UI:
  - `ui/src/lib/types/connection.ts` — `description` → `note`
  - `ui/src/components/` 의 connection 입력/표시 컴포넌트 (라벨 "Description" → "Note", placeholder 등)
- 마이그레이션 호환: alias 미지원(깔끔한 절단). 기존 클라이언트가 `description`으로 보내면 422 — `.env.example` 또는 release note에 명시.

### Models (신규 set/record note)
- `api/src/aerospike_cluster_manager_api/models/cluster.py` — `SetInfo.note: str | None = None` 추가
- `api/src/aerospike_cluster_manager_api/models/record.py` — `AerospikeRecord.note: str | None = None` 추가
- `api/src/aerospike_cluster_manager_api/models/note.py` (신규) — `SetNote`, `RecordNote`, `UpsertSetNoteRequest`, `UpsertRecordNoteRequest`

### DB layer
- `db/_base.py` — Protocol에 메서드 추가:
  - `upsert_set_note(conn_id, ns, set_name, note, updated_by) -> SetNote`
  - `delete_set_note(conn_id, ns, set_name) -> bool`
  - `get_set_note(conn_id, ns, set_name) -> SetNote | None`
  - `list_set_notes(conn_id, ns=None) -> list[SetNote]`
  - `batch_get_set_notes(conn_id, ns, set_names: list[str]) -> dict[(ns, set), str]`  ← `get_cluster_info` join용
  - `upsert_record_note(conn_id, ns, set_name, pk_text, pk_type, note, updated_by) -> RecordNote`
  - `delete_record_note(conn_id, ns, set_name, pk_text, pk_type) -> bool`
  - `list_record_notes(conn_id, ns, set_name) -> list[RecordNote]`
  - `batch_get_record_notes(conn_id, ns, set_name, pks: list[(pk_text, pk_type)]) -> dict[(pk_text, pk_type), str]`  ← random-50 join용
- `db/_sqlite.py` — 마이그레이션(CREATE TABLE IF NOT EXISTS) + 위 메서드 구현 (FK는 PRAGMA foreign_keys 확인 필요)
- `db/_postgres.py` — 동일

### Services / Routers
- `services/records_service.py` — `list_records()`에서 raw record 변환 후 `batch_get_record_notes()` 한 번 호출하여 note 주입; `get_record_detail()` 도 동일
- `services/clusters_service.py` — `get_cluster_info()`에서 namespace 별로 set name 모은 뒤 `batch_get_set_notes()` 호출하여 SetInfo.note 주입
- `routers/notes.py` (신규) — 6개 endpoint (PUT/DELETE/GET sets, PUT/DELETE/GET records)
- `main.py` — 라우터 등록

### MCP
- `mcp/tools/notes.py` (신규) — 6개 툴 (`update_set_note`, `delete_set_note`, `list_set_notes`, `update_record_note`, `delete_record_note`, `list_record_notes`)
- (기존 `mcp/tools/records.py`, `mcp/tools/clusters.py`는 무변경 — 응답 모델 확장으로 자동 노출)

### UI
- `ui/src/lib/types/note.ts` (신규) — TS mirror
- `ui/src/lib/types/cluster.ts`, `record.ts` — `note?: string` 필드 추가
- `ui/src/lib/api/notes.ts` (신규) — fetch 클라이언트
- `ui/src/hooks/use-notes.ts` (신규) — Zustand 통합 또는 SWR 훅
- `ui/src/app/(main)/clusters/[clusterId]/sets/page.tsx` — set 카드에 note 칩 + 편집 모달
- `ui/src/app/(main)/clusters/[clusterId]/sets/[ns]/[set]/page.tsx` — record 테이블에 note 컬럼 (truncate) + inline 편집 + "노트 있는 record만 보기" 토글
- `ui/src/app/(main)/clusters/[clusterId]/sets/[ns]/[set]/records/[key]/page.tsx` — record detail에 note 섹션 (textarea)

---

## 6. 미해결 (구현 시점에 결정해도 무방)

1. **저자(updated_by) UI 노출 여부**: DB에는 항상 저장. UI 노출은 "최근 수정자: ksr@..." 형태의 작은 footnote 정도 권장 (workspace 멀티 유저 환경에서 유용).
2. **노트 길이 제한**: API 레벨 8KB로 제한 (Pydantic `max_length=8192`) — PG/SQLite TEXT는 무제한이지만 UI 렌더링/API payload 합리화 차원. 8KB면 한글 2700자 가능.
3. **Frontend 인라인 편집 vs 모달**: set은 카드가 작으니 모달, record 테이블은 inline edit (truncate + click-to-expand). 1차에는 모달로 통일하고 추후 개선해도 OK.

---

## 7. Verification (구현 후 어떻게 검증할지)

0. **Connection rename 마이그레이션 검증**:
   - 기존 `description` 컬럼이 있는 SQLite/PG DB로 시작 → init_db() 실행 → `description` 사라지고 `note` 컬럼에 데이터 보존 확인
   - 두 번째 실행에서 idempotent (이미 note 컬럼만 있으면 no-op)
   - GET/POST /api/connections 가 `note` 필드로 응답/수락 확인
   - MCP `create_connection({note: "..."})` 동작 확인

1. **Unit (DB layer)**: `db/_sqlite.py`, `db/_postgres.py` CRUD round-trip
   - upsert/delete idempotency
   - `(pk_text="42", pk_type="string")` 와 `(pk_text="42", pk_type="int")` 가 별개 row로 저장됨 확인
   - `batch_get_record_notes` 빈 list 입력 처리

2. **Integration (Aerospike + metaDB)**: `compose.dev.yaml` 띄우고 seed-data.sh 실행
   - `feature_v4_pctr` 비슷한 set 만들고 `update_set_note` 호출
   - `GET /api/clusters/{conn_id}` 응답의 `SetInfo.note`에 노출 확인
   - 50건 record 중 5개에만 record_note → `GET /api/records/{conn_id}?ns=test&set=...` 응답에서 5개만 `note` 채워짐 확인

3. **Batch lookup 성능**: SQLite `EXPLAIN QUERY PLAN`으로 50건 IN 쿼리가 인덱스 사용하는지 확인 (idx_rec_notes_conn_ns_set + pk_text)

4. **MCP wire-level (PR #312 패턴)**: `e2e_pytest`/유사 위치에 JSON-RPC 호출
   - `update_record_note` → `get_record` 응답에 note 포함 확인
   - `update_set_note` → `get_cluster_info` 응답의 SetInfo.note 포함 확인
   - `_assert_workspace_owns_arg`: 다른 workspace 의 conn_id 로 `update_record_note` 호출 시 `workspace_mismatch` 반환 확인

5. **Workspace 격리 (transitive)**: 두 workspace 각자 connection 등록 → 한쪽에서 만든 노트가 다른 workspace 의 connection으로 안 보임 확인

6. **UI**: `npm run dev` (port 3100)
   - cluster → set 카드에 노트 칩 표시 + 편집 모달 동작
   - record 테이블에 note 컬럼 (truncate 표시), 클릭 시 detail 페이지에서 편집
   - "노트 있는 record만 보기" 토글 → `GET /api/notes/records/{conn_id}?ns=&set=` 호출하여 필터

7. **Cascade**:
   - Connection 삭제 → 해당 connection의 노트 모두 cascade 삭제 확인
   - Workspace 삭제 → connection cascade → 노트 cascade (chain) 확인

8. **Random-50 사각지대 검증**: 1000건 set 에 record 5개에만 노트 → 노트 있는 5개 중 일부가 random 50 에 못 걸려도 `GET /api/notes/records/{conn_id}?ns=&set=`로 5개 모두 발견 가능 확인 (UI에서 "노트 있는 record만" 필터 동작)

9. **Pre-commit**: `cd api && uv run ruff check src --fix && uv run ruff format src`, UI는 `npm run lint:fix && npm run type-check && npm run test`

---

## 8. Out of scope (의도적으로 제외)

- 노트 history/version (1차는 last-write-wins; 향후 `record_note_history` 테이블 추가 가능)
- Bin-level 노트 (set/record 까지로 충분; bin 레벨로 가면 metaDB 폭발 + 의미 모호)
- Markdown 렌더링 (plain text + 줄바꿈만; XSS 위험도 회피)
- Full-text search on note body (1차는 "노트 있는 record만 보기" 토글로 충분; 본문 검색은 후속 SQLite FTS5)
- 외부 카탈로그(DataHub, Amundsen) sync (별도 ADR 거리)
- digest-only record (send-key=false) 지원 — 후속, 1차에는 API 400 거절
- Optimistic locking (`If-Match: <updated_at>`) — last-write-wins 충분
- 외부 클러스터 식별자(cluster GUID) 기반 노트 공유 — connection 스코프 결정으로 명시 제외

---

## 9. 사용자가 우려한 두 지점에 대한 직접 응답

### A. "기존 API에 합칠지 vs 별도 CRUD API 만들지"
**답: 둘 다.** 읽기는 인라인(round-trip 1회 + 단일 batch SQL → UI/MCP 모두 자연스럽게 노트 포함), 쓰기/검색은 분리(MCP 툴 발견성 + 노트 검색용 endpoint).

### B. "random 50 에 안 걸리면 노트 만들어 놓고도 못 본다"
**답: `GET /api/notes/records/{conn_id}?ns=&set=` endpoint가 해법.** 이 endpoint는 노트 있는 record의 pk만 모아서 반환하므로, UI에서 "노트 있는 record만 보기" 토글로 random scan 사각지대를 우회할 수 있다. MCP `list_record_notes` 툴도 같은 데이터 노출.

---

## 10. 위험 요소

| 위험 | 완화 |
|------|------|
| pk_text 길이 1024자 → SQLite PK 인덱스 비대화 | 1차에 비대화 측정 후 필요 시 hash(pk_text)를 보조 컬럼으로 추가 |
| record 삭제 후 노트 orphan | 1차 미해결 (실제 record 존재 여부는 read 시점에 자연스럽게 드러남). 후속에 `cleanup_orphan_record_notes` job 가능 |
| connection 재생성 시 노트 손실 | 사용자가 의도적으로 선택한 connection 스코프의 결과 — 문서화로 노출 |
| pk_type 'auto' 의 휴리스틱 → 같은 pk가 다른 row로 저장 | API 응답 시 pk_type을 함께 반환 → UI/MCP가 명시적으로 핸들링 |
| Connection rename으로 외부 클라이언트 깨짐 | Breaking change임을 release note에 명시. 이번 PR 자체에서 cluster-manager 내부(UI, MCP) 모두 동시 갱신해서 자체 정합성은 보장 |
| SQLite 마이그레이션 중 RENAME COLUMN 실패 (3.25 미만) | runtime SQLite 버전 체크 후 fallback (ADD note + UPDATE + 새 테이블 swap). 일반 podman 이미지(3.40+)는 문제 없음 |

---

## 11. 산출물 위치

- 이 plan 파일: `/Users/ksr/.claude/plans/aerospike-cluster-manager-lively-pretzel.md` (harness 워크스페이스)
- **사용자 요청에 따라 ExitPlanMode 승인 후 동일 내용을 프로젝트 루트 `plan.md`로 복사**: `/Users/ksr/github/asc-workspace/aerospike-cluster-manager/plan.md`
