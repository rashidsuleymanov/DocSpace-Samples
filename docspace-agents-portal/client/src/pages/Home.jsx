import React from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../services/session.js";

function Icon({ name }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg"
  };

  if (name === "kb") {
    return (
      <svg {...common}>
        <path
          d="M8.5 7.5h7M8.5 11h7M8.5 14.5h4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M7 3.5h10a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-11a3 3 0 0 1 3-3Z"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
    );
  }

  if (name === "model") {
    return (
      <svg {...common}>
        <path
          d="M12 3.5c5 0 9 2 9 4.5s-4 4.5-9 4.5-9-2-9-4.5 4-4.5 9-4.5Z"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M3 8v4.5c0 2.5 4 4.5 9 4.5s9-2 9-4.5V8"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M7.8 20.2c1.2.3 2.6.5 4.2.5 1.6 0 3-.2 4.2-.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "widget") {
    return (
      <svg {...common}>
        <path
          d="M6.5 6.5h11v8.5a3.5 3.5 0 0 1-3.5 3.5H10l-3.5 2v-2H6.5A3.5 3.5 0 0 1 3 15V10a3.5 3.5 0 0 1 3.5-3.5Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M8 11h5M8 14h7"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return null;
}

export default function Home() {
  const nav = useNavigate();
  const session = useSession();

  function goStudio() {
    nav(session.isAuthed ? "/studio" : "/studio/login");
  }

  return (
    <div className="container home">
      <div className="home-topbar">
        <div className="home-brand" onClick={() => nav("/")} role="button" tabIndex={0}>
          <div className="home-brand-mark">A</div>
          <div className="home-brand-text">
            <div className="home-brand-title">Agents</div>
            <div className="home-brand-sub">Studio + Widget</div>
          </div>
        </div>
        <div className="home-topbar-actions">
          <button className="btn" onClick={goStudio}>
            {session.isAuthed ? "Открыть Studio" : "Войти"}
          </button>
          <button className="link-btn" type="button" onClick={() => nav("/studio/templates")}>
            Шаблоны
          </button>
        </div>
      </div>

      <div className="home-hero">
        <div className="home-hero-left">
          <div className="home-badge">Агенты из ваших документов</div>
          <h1 className="home-title">Ответы и действия — на базе ваших файлов</h1>
          <div className="home-subtitle">
            Создайте агента, подключите файлы из ваших комнат и получите чат‑виджет для сайта. Пользователи виджета не
            видят рабочее пространство и не нуждаются в аккаунте.
          </div>
          <div className="home-cta">
            <button className="btn" onClick={goStudio}>
              Начать в Studio
            </button>
            <button className="btn secondary" onClick={() => nav("/studio/templates")}>
              Выбрать шаблон
            </button>
          </div>
          <div className="home-note">
            Источники знаний выбираются внутри Studio: можно выбрать существующие файлы или загрузить новый прямо в нужную
            комнату, затем синхронизировать базу знаний (RAG).
          </div>
        </div>

        <div className="home-hero-right">
          <div className="home-mock">
            <div className="home-mock-top">
              <div className="home-dot red" />
              <div className="home-dot yellow" />
              <div className="home-dot green" />
              <div className="home-mock-title">Preview</div>
            </div>
            <div className="home-mock-body">
              <div className="home-chat">
                <div className="home-chat-bubble bot">Привет! Я агент из ваших документов. Чем помочь?</div>
                <div className="home-chat-bubble user">Сделай follow‑up после демо</div>
                <div className="home-chat-bubble bot">
                  Ок. Коротко зафиксирую: цели, ценность, следующий шаг и вопросы. Хочешь тон “строго” или “дружелюбно”?
                </div>
              </div>
              <div className="home-mock-footer">
                <div className="home-input-skeleton">Напишите сообщение…</div>
                <div className="home-send">Send</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="home-section">
        <div className="home-section-title">Что внутри</div>
        <div className="home-features">
          <div className="home-card">
            <div className="home-card-icon">
              <Icon name="kb" />
            </div>
            <div className="home-card-title">База знаний</div>
            <div className="home-card-text">Выбор файлов из ваших комнат и синхронизация KB для точных ответов по документам.</div>
          </div>
          <div className="home-card">
            <div className="home-card-icon">
              <Icon name="model" />
            </div>
            <div className="home-card-title">LLM‑провайдер</div>
            <div className="home-card-text">Ollama или OpenAI. Для каждого агента можно выбрать модель и настройки отдельно.</div>
          </div>
          <div className="home-card">
            <div className="home-card-icon">
              <Icon name="widget" />
            </div>
            <div className="home-card-title">Виджет для сайта</div>
            <div className="home-card-text">Встраивание одной строкой + настройка внешнего вида (цвета, радиусы, позиция).</div>
          </div>
        </div>
      </div>

      <div className="home-section">
        <div className="home-section-title">Как запустить</div>
        <div className="home-steps">
          <div className="home-step">
            <div className="home-step-num">1</div>
            <div>
              <div className="home-step-title">Войти</div>
              <div className="muted">Войдите в Studio через вашу учетную запись рабочего пространства.</div>
            </div>
          </div>
          <div className="home-step">
            <div className="home-step-num">2</div>
            <div>
              <div className="home-step-title">Создать агента</div>
              <div className="muted">С нуля или из шаблона (например, Support / Sales).</div>
            </div>
          </div>
          <div className="home-step">
            <div className="home-step-num">3</div>
            <div>
              <div className="home-step-title">Подключить знания</div>
              <div className="muted">Выберите файлы (или загрузите новые) и нажмите Sync KB.</div>
            </div>
          </div>
          <div className="home-step">
            <div className="home-step-num">4</div>
            <div>
              <div className="home-step-title">Встроить</div>
              <div className="muted">Скопируйте embed‑код из агента и вставьте на сайт.</div>
            </div>
          </div>
        </div>

        <div className="home-footnote">
          Совет: начните с шаблона, затем подключите Knowledge Base и нажмите Sync KB — после этого агент начнет отвечать по
          вашим документам.
        </div>
      </div>
    </div>
  );
}
