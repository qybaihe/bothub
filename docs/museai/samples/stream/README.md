# chat.stream subscription samples

Reconstructed from muse.ai JS (`streamMode:"subscription"` + NDJSON body chunks).
Not raw wire captures (Noise encrypts the channel). Field names match the
frontend event reducer in `js/21rnprfgq7_go.js` / delta markers in
`js/1kuj3_qtxzpra.js`.

Envelope (each NDJSON line after the ack):
```json
{
  "type": "event",
  "event_name": "delta.text_append",
  "message_id": "...",
  "seq": 3,
  "occurred_at_ms": 1730000000200,
  "display_text": "...",
  "payload": { },
  "resources": [],
  "author": null
}
```

Internal UI also uses uppercase markers `DELTA_MESSAGE_START` /
`DELTA_FIRST_TEXT` / `DELTA_TEXT_APPEND` / `DELTA_MESSAGE_DONE` for perf
spans; wire `event_name` values are lowercase dotted forms above.
