# DocSpace plugin: DB → XLSX via JS SDK

Отдельный проект-плагин в `docspace-db-xlsx-plugin`.

## Что внутри
- Backend: `docspace-db-xlsx-plugin/server/index.js`
  - `/api/db/tables`
  - `/api/db/rows`
  - `/api/docspace/create-xlsx`
- Plugin UI+SDK: `docspace-db-xlsx-plugin/plugin/index.html`
  - логика: `docspace-db-xlsx-plugin/plugin/src/index.js`
  - манифест: `docspace-db-xlsx-plugin/plugin/config.json`

## Запуск backend
В одном терминале:
- `cd docspace-db-xlsx-plugin/server`
- `npm i`
- `npm run dev`

## Как подключить плагин
1) Раздай папку `docspace-db-xlsx-plugin/plugin` как статику (любой простой http-server).
2) Подключи плагин в DocSpace как внешний по URL на `index.html`.
3) Открой плагин внутри комнаты (room).

## Как пользоваться
- Укажи `Backend URL` (по умолчанию `http://localhost:5180`)
- Настройки БД → `Load tables`
- Выбери таблицу → `Export via SDK (.xlsx)`

Плагин создаёт пустой `.xlsx` в комнате и заполняет его через `executeInEditor` в скрытом фрейме.
