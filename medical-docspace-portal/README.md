# DocSpace Medical Portal (Sample)

End‑to‑end local sample that creates a DocSpace user, provisions a patient room,
builds a folder structure, and shows a patient dashboard + settings screen.

## Stack

- **Server**: Node.js + Express (single process)
- **Client**: React + Vite (served via the same Express process)

## Run (local)

```powershell
cd d:\Workspace\massive-samples\DocSpace-Samples\medical-docspace-portal
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
DOCSPACE_DOCTOR_EMAIL=doctor@clinic.com
DOCSPACE_DOCTOR_ACCESS=RoomManager
DOCSPACE_PATIENT_ACCESS=Editing
DOCSPACE_TEMPLATE_TICKET_ID=YOUR_TICKET_TEMPLATE_ID
DOCSPACE_TEMPLATE_CONTRACT_ID=YOUR_CONTRACT_TEMPLATE_ID
DOCSPACE_TEMPLATE_WELCOME_ID=YOUR_WELCOME_TEMPLATE_ID
```

Notes:

- **Admin token** is stored **server‑side only** and never sent to the browser.
- In **demo mode**, the portal uses a **server-side cookie session** and does not store DocSpace tokens in the browser.
- `VITE_DOCSPACE_URL` is only used to build the **Open in DocSpace** link in UI.

### Demo mode (recommended for buyer demos)

Set:

```
DEMO_MODE=true
```

Then the UI starts with a **Start demo** screen that provisions an anonymous patient + doctor and a fresh patient room.
Sessions are cleaned up automatically by a TTL/idle janitor (configurable via `DEMO_SESSION_*` env vars).

## How the flow works

### Register

1. Create DocSpace user
2. Create patient room
3. Create default folders
4. Optionally copy template files into Personal Data
5. Share room with the patient (and doctor if configured)

DocSpace calls:

- `POST /api/2.0/people`
- `POST /api/2.0/files/rooms`
- `POST /api/2.0/files/folder/{roomId}`
- `POST /api/2.0/files/file/{fileId}/copyas`
- `PUT /api/2.0/files/rooms/{roomId}/share`

### Login

1. Authenticate user (`POST /api/2.0/authentication`)
2. Get profile (`GET /api/2.0/people/@self`)
3. Resolve patient room by title
4. Ensure the room is shared with the user
5. Store token in the browser (localStorage)

### Dashboard / Folder access

Room reads send the **user token** from the browser to the server.

## Folder structure (default)

- Personal Data
- Contracts
- Lab Results
- Medical Records
- Appointments
- Fill & Sign
- Sick Leave
- Insurance
- Prescriptions
- Imaging

## Project layout

```
medical-docspace-portal/
  client/        # React UI
  server/        # Express API + DocSpace calls
  .env
```

## Troubleshooting

If you see **Port is already in use**:

- Another `npm run dev` process is already running on `PORT` (default `5173`).
- Stop the existing Node process, or set `PORT` to a free value in `.env` (for example `PORT=5174`).
- If `PORT` is not set, the app will try `5173` and then pick the next available port.

If you see **403** for room summary or folder contents:

- Verify the room was shared with the patient.
- Ensure the admin token has permissions for rooms/files/users.
- Log in again to refresh the session.

If profile updates don’t apply:

- Admin token must allow `users:write`.
- Fields like `sex` and `birthday` must match API formats.

## Security notes

For production you should avoid localStorage and move to server‑side sessions.
