'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAccount, usePublicClient, useSignMessage } from 'wagmi';
import { Providers } from '../../../../../components/Providers';
import { AppShell } from '../../../../../components/AppShell';
import { loadOwnedAgents, API_BASE, apiJson, ensureOwnerSession } from '../../agentClient';
import styles from '../../agents.module.css';
import AITaskList from '../../../../../components/ui/ai-task-list';

function ChatContent() {
  const { account } = useParams();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { signMessageAsync } = useSignMessage();

  const [agent, setAgent] = useState(null);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const taskPlan = [
    {
      id: 'understand',
      label: 'Understand the request',
      status: sending ? 'running' : messages.length ? 'done' : 'pending',
    },
    {
      id: 'evaluate',
      label: 'Evaluate agent context',
      status: messages.length ? (sending ? 'pending' : 'done') : 'pending',
      children: [
        { id: 'policy', label: 'Check configured permissions', status: messages.length && !sending ? 'done' : 'pending' },
        { id: 'runtime', label: 'Prepare agent runtime', status: sending ? 'running' : 'pending' },
      ],
    },
    {
      id: 'execute',
      label: 'Execute and return result',
      status: sending ? 'running' : 'pending',
    },
  ];

  useEffect(() => {
    if (!address || !publicClient) return;
    loadOwnedAgents({ address, publicClient })
      .then((agents) => {
        const selected = agents.find((item) => item.account.toLowerCase() === String(account).toLowerCase());
        setAgent(selected || null);
      })
      .catch((e) => setError(e.message));
  }, [address, publicClient, account]);

  function updateMessage(messageId, patch) {
    setMessages((current) => current.map((item) => (
      item.id === messageId ? { ...item, ...patch } : item
    )));
  }

  async function sendChat() {
    if (!agent || !message.trim() || sending) return;
    const submittedMessage = message.trim();
    const localUserId = `user-${crypto.randomUUID()}`;
    const pendingMessageId = `assistant-${crypto.randomUUID()}`;

    setSending(true);
    setError('');
    setMessages((current) => [
      ...current,
      { role: 'user', content: submittedMessage, id: localUserId },
      { role: 'assistant', content: 'Thinking…', id: pendingMessageId, pending: true },
    ]);
    setMessage('');

    try {
      await ensureOwnerSession({ address, account: agent.account, signMessageAsync });
      const result = await apiJson(`${API_BASE}/api/v1/agents/${agent.id}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: submittedMessage }),
      });

      updateMessage(pendingMessageId, {
        content: result.result?.answer || 'The request was processed.',
        pending: false,
      });
    } catch (e) {
      setMessages((current) => current.filter((item) => item.id !== pendingMessageId));
      setError(e.message);
    } finally {
      setSending(false);
    }
  }
  if (!agent) return <main className={styles.page}><div className={styles.emptyState}>Loading agent…</div></main>;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link className={styles.backButton} href={`/app/agents/${agent.account}`}>← Agent dashboard</Link>
          <h1>Chat with {agent.name}</h1>
          <p>Talk to the agent without exposing your owner private key.</p>
        </div>
        <Link className={styles.secondaryButton} href={`/app/agents/${agent.account}/configure`}>Configure</Link>
      </header>

      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.chatPage}>
        <div className={styles.chatWorkspace}>
          <div className={styles.chat}>
            <div className={styles.chatHeader}>
              <div>
                <span className={styles.chatKicker}>AGENT CONVERSATION</span>
                <h2>{agent.name}</h2>
                <p>Ask about balances, positions, activity, or the agent's configured strategy.</p>
              </div>
              <span className={styles.chatLiveBadge}>
                <i aria-hidden="true" />{agent.active ? 'Active' : 'Paused'}
              </span>
            </div>

            <div className={styles.chatHistory}>
              {messages.length ? messages.map((item, index) => (
                <div key={item.id || index} className={item.role === 'user' ? styles.chatUser : styles.chatAgent}>
                  <span>{item.role === 'user' ? 'You' : agent.name}</span>
                  <p>{item.content}</p>{item.pending ? <small className={styles.chatPending}>{item.delayed ? 'Runner still processing' : 'Processing…'}</small> : null}
                </div>
              )) : (
                <div className={styles.chatWelcome}>
                  <div className={styles.chatWelcomeIcon} aria-hidden="true">✦</div>
                  <strong>What can I check for you?</strong>
                  <p>Use a prompt below or write your own request.</p>
                  <div className={styles.chatSuggestions}>
                    {['Check my USDC balance', 'Show recent activity', 'What is my strategy?'].map((prompt) => (
                      <button key={prompt} type="button" onClick={() => setMessage(prompt)}>{prompt}<span>↗</span></button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className={styles.chatPlan}>
          <AITaskList label="Live plan" tasks={taskPlan} />
        </aside>

        <div className={styles.chatComposerLarge}>
          <div className={styles.chatComposerShell}>
            <input className={styles.input} value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) sendChat(); }} placeholder="Message your agent…" aria-label="Message your agent" />
            <button className={styles.primaryButton} disabled={sending || !message.trim()} onClick={sendChat}>{sending ? 'Replying…' : 'Send ↗'}</button>
          </div>
          <span className={styles.chatComposerHint}>Press Enter to send · Agent actions stay within configured permissions.</span>
        </div>
      </section>
    </main>
  );
}

export default function AgentChatPage() {
  return <Providers><AppShell><ChatContent /></AppShell></Providers>;
}
