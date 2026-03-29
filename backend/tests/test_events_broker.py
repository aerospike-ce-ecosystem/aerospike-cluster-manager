"""Unit tests for the SSE event broker."""

from __future__ import annotations

import pytest

from aerospike_cluster_manager_api.events.broker import EventBroker


@pytest.fixture()
def broker() -> EventBroker:
    return EventBroker(max_connections=3, queue_size=4)


async def test_subscribe_and_publish(broker: EventBroker) -> None:
    sub_id, queue = await broker.subscribe(event_types={"test.event"})
    assert broker.subscriber_count == 1

    await broker.publish({"event": "test.event", "data": {"msg": "hello"}})
    event = queue.get_nowait()
    assert event["data"]["msg"] == "hello"

    await broker.unsubscribe(sub_id)
    assert broker.subscriber_count == 0


async def test_type_filtering(broker: EventBroker) -> None:
    _, q1 = await broker.subscribe(event_types={"a"})
    _, q2 = await broker.subscribe(event_types={"b"})
    _, q_all = await broker.subscribe(event_types=None)

    await broker.publish({"event": "a", "data": {}})
    assert q2.empty()  # q2 should be empty — event "a" doesn't match type "b"
    assert q1.qsize() == 1
    assert q_all.qsize() == 1
    assert q2.qsize() == 0


async def test_max_connections(broker: EventBroker) -> None:
    for _ in range(3):
        await broker.subscribe()
    with pytest.raises(ConnectionError, match="max connections"):
        await broker.subscribe()


async def test_queue_overflow_drops_oldest(broker: EventBroker) -> None:
    _, queue = await broker.subscribe(event_types=None)
    # Queue size is 4, fill it
    for i in range(4):
        await broker.publish({"event": "x", "data": {"i": i}})
    assert queue.qsize() == 4

    # 5th publish should drop the oldest
    await broker.publish({"event": "x", "data": {"i": 99}})
    assert queue.qsize() == 4
    # First item should now be i=1 (i=0 was dropped)
    first = queue.get_nowait()
    assert first["data"]["i"] == 1


async def test_unsubscribe_idempotent(broker: EventBroker) -> None:
    sub_id, _ = await broker.subscribe()
    await broker.unsubscribe(sub_id)
    await broker.unsubscribe(sub_id)  # should not raise
    assert broker.subscriber_count == 0


async def test_publish_to_no_subscribers(broker: EventBroker) -> None:
    # Should not raise
    await broker.publish({"event": "test", "data": {}})
