# DocSpace Client Workspace Portal (Demo Stand)

Demo-first stand that provisions a temporary client user, creates a dedicated DocSpace room,
lays out a collaboration-ready folder structure, and demonstrates both the client-facing
workspace and the internal manager hub.

## Stack

- **Server**: Node.js + Express (single process)
- **Client**: React + Vite (served via the same Express process)

## Run (local)

```powershell
cd d:\Workspace\massive-samples\DocSpace-Samples\docspace-client-workspace-portal
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
DOCSPACE_MANAGER_EMAIL=manager@your-company.com
DOCSPACE_MANAGER_ACCESS=RoomManager
DOCSPACE_CLIENT_ACCESS=Editing
```

Notes:

- **Admin token** stays server-side only and is never sent to the browser.
- **Client tokens** are created during login and stored in localStorage for this sample.
- `VITE_DOCSPACE_URL` is only used to build open/share links in the UI.

## Demo flow

### Start demo

1. Enter a client name, company name, and manager name
2. The server creates temporary DocSpace users for the client and manager
3. The server creates a dedicated client room
4. The server creates default folders and seeds a few starter documents
5. The UI boots directly into the client-facing workspace

DocSpace calls:

- `POST /api/2.0/people`
- `POST /api/2.0/authentication`
- `POST /api/2.0/files/rooms`
- `POST /api/2.0/files/folder/{roomId}`
- `PUT /api/2.0/files/rooms/{roomId}/share`

### Client workspace

1. Review the room structure
2. Open files inside the embedded DocSpace modal
3. Respond to manager action items
4. Create and complete project packages

### Manager hub

1. Switch to the manager role from the header
2. Review submitted project packages
3. Create action items for missing files
4. Generate a manager summary document
5. Mark the package as completed

## Folder structure

- `Shared Documents`
- `Action Items`
- `Projects`

## Project layout

```text
docspace-client-workspace-portal/
  client/        # React UI
  server/        # Express API + DocSpace calls
  .env
```

## Notes

- The stand now runs in a demo-session flow instead of a classic login/register flow.
- Temporary DocSpace credentials are exposed only through the demo session cookie and are used
  to authenticate the embedded editor modal.
- Ending the demo clears the local demo session. This sample does not yet perform remote cleanup
  of the created DocSpace users/rooms.
