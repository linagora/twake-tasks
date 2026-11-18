#!/bin/bash
# Activity events: the other apps of Twake Workplace learn of the changes made in Twake Tasks through RabbitMQ (the
# CloudEvents on the `activity` exchange, written to the outbox in the change's transaction, relayed once committed).
# A consumer (a queue of its own bound to com.twake.tasks.task.created.v1, as another app binds one) is ready; frank
# creates a task in his Inbox; the consumer receives the task.created event of that task. Task purged at the end.
. "$(dirname "$0")/lib.sh"
BUDGET=50

user=frank
board="$(inbox_of "$user")" || fail "$(api_err)"
title="Activity $TOKEN_RUN"
out="$TMP/consumer"
in_backend "$((BUDGET - 5))" '
const amqp = await import(process.env.AMQPLIB)
const [needle, seconds] = process.argv.slice(1)
const done = (code, m) => { console.log(m); process.exit(code) }
setTimeout(() => done(1, "no event in " + seconds + " s"), Number(seconds) * 1000).unref()
try {
  const c = await amqp.connect(process.env.RABBITMQ_URL, { timeout: 10000 })
  c.on("error", e => done(1, "connection lost: " + e.message))
  c.on("close", () => done(1, "connection closed"))
  const ch = await c.createChannel()
  const { queue } = await ch.assertQueue("", { exclusive: true, autoDelete: true, durable: false, arguments: { "x-queue-type": "classic" } })
  await ch.bindQueue(queue, "activity", "com.twake.tasks.task.created.v1")
  await ch.consume(queue, msg => {
    const text = msg.content.toString() + JSON.stringify(msg.properties.headers ?? {})
    if (text.includes(needle)) done(0, "received " + msg.fields.routingKey)
  }, { noAck: true })
  console.log("ready")
} catch (e) { done(1, "consumer: " + (e?.message ?? e)) }' "$TOKEN_RUN" "$((BUDGET - 8))" >"$out" 2>&1 &
pid=$!
on_exit "kill $pid"

until grep -q '^ready' "$out" 2>/dev/null; do
  kill -0 $pid 2>/dev/null || { wait $pid; fail "no consumer can bind to the activity exchange: $(tail -1 "$out")"; }
  [ "$(remaining)" -gt 0 ] || fail "the consumer is not ready in $BUDGET s"
  sleep 0.2
done
new_task "$user" "$board" "$title" >/dev/null || fail "create a task: $(api_err)"
wait $pid
rc=$?
[ $rc = 0 ] && ok "the task.created event reached a consumer in $((SECONDS - START)) s"
fail "the task.created event did not reach the consumer: $(tail -1 "$out")"
