# Board Mail inbound email

## Behavior

- The Cloudflare Email Worker continues forwarding inbound mail to the configured clerk or per-address route. Archive forwarding remains best effort.
- After delivery, the Worker parses the original RFC 822 message and stores an Inbox record in the existing `SUBMISSIONS` R2 bucket.
- Board Mail displays the sender, subject, received time and a safe plain text rendering. When an HTML alternative exists, the Worker extracts visible text from it (link labels and image alt text); HTML markup, attachments and raw email are not stored.
- Replies use the address the original message was sent to, subject to the user's configured send-as permissions. Admins retain full sender access.
- Website form submissions keep their current behavior and reply address.

## Bounds and failure handling

- Messages over 5 MiB are skipped for Inbox storage.
- MIME parsing is limited to 20 nested parts, 100 MIME parts and 64 KiB of headers.
- Stored plain text is capped at 100,000 characters; subject is capped at 150 characters.
- Parse or R2 storage errors are logged without rejecting mail after the clerk delivery has succeeded.
- The Inbox stores only parsed text and routing metadata. It does not retain the raw source, HTML body or attachments.

## Release checks

The Worker CI build and smoke checks validate the deployment bundle. Inbound R2 persistence and Cloudflare Email Routing are runtime integrations, so a production verification should send a test message to a church address and confirm it arrives both at the clerk and in Board Mail.
