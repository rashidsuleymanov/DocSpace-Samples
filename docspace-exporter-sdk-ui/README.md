# DocSpace: DB → XLSX → Room (JS SDK)

Теперь экспорт идёт через DocSpace JS SDK (`executeInEditor`) в скрытом фрейме:
- backend создаёт пустой `.xlsx` и выдаёт `shareToken`
- фронт открывает редактор скрыто и заполняет таблицу

## Запуск
- `npm run dev`

## Как использовать
1) Заполни DocSpace (Base URL, Token, Room ID, Folder Title)
2) Заполни БД (локальный Postgres проще всего)
3) `Load tables` → выбери таблицу
4) `Export via SDK → XLSX → Room`

## Важно
- Для SDK нужен рабочий `shareToken` на запись. Мы получаем его в `/api/docspace/create-xlsx`.
- Если upload endpoint у портала отличается — это не влияет на SDK-режим.
