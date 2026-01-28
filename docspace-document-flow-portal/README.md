# DocSpace Document Flow Portal (Sample)

End-to-end local sample that creates a DocSpace user, provisions a citizen room,
builds a document flow structure, and shows dashboards for citizens + officers.

## Stack

- **Server**: Node.js + Express (single process)
- **Client**: React + Vite (served via the same Express process)

## Run (local)

```powershell
cd d:\Workspace\massive-samples\DocSpace-Samples\docspace-document-flow-portal
copy .env.example .env
npm install
npm run dev
```

Open http://localhost:5173

## Environment (.env)

Required:

```
DOCSPACE_BASE_URL=https://your-docspace.example.com
DOCSPACE_AUTH_TOKEN=YOUR_DOCSPACE_ADMIN_TOKEN
```

Optional:

```
VITE_DOCSPACE_URL=https://your-docspace.example.com
DOCSPACE_OFFICER_EMAIL=officer@service.gov
DOCSPACE_OFFICER_ACCESS=RoomManager
DOCSPACE_PATIENT_ACCESS=Read
```

Notes:

- **Admin token** is stored **server‑side only** and never sent to the browser.
- **User tokens** are created during login and stored **in the browser** (localStorage).
- `VITE_DOCSPACE_URL` is only used to build the **Open in DocSpace** link in UI.

## How the flow works

### Register

1. Create DocSpace user
2. Create citizen room
3. Create default folders
4. Share room with the citizen (and officer if configured)

DocSpace calls:

- `POST /api/2.0/people`
- `POST /api/2.0/files/rooms`
- `POST /api/2.0/files/folder/{roomId}`
- `PUT /api/2.0/files/rooms/{roomId}/share`

### Login

1. Authenticate user (`POST /api/2.0/authentication`)
2. Get profile (`GET /api/2.0/people/@self`)
3. Resolve citizen room by title
4. Ensure the room is shared with the user
5. Store token in the browser (localStorage)

### Applications

1. Select an application type
2. Submit fields
3. Create a folder under **Applications**
4. Generate template documents
5. Officer sees the same application with submitted data and documents

## Folder structure (default)

- My Documents
- Requests Inbox
- Applications

## Project layout

```
docspace-document-flow-portal/
  client/        # React UI
  server/        # Express API + DocSpace calls
  .env
```

## Troubleshooting

If you see **403** for room summary or folder contents:

- Verify the room was shared with the citizen.
- Ensure the admin token has permissions for rooms/files/users.
- Log in again to refresh the session.

If profile updates don’t apply:

- Admin token must allow `users:write`.
- Fields like `sex` and `birthday` must match API formats.

## Security notes

For production you should avoid localStorage and move to server‑side sessions.
