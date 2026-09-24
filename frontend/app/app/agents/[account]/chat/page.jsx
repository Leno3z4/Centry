'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAccount, usePublicClient, useSignMessage } from 'wagmi';
import { Providers } from '../../../../../components/Providers';
import { AppShell } from '../../../../../components/AppShell';
import { loadOwnedAgents, API_BASE, apiJson, ensureOwnerSession } from '../../agentClient';
import styles from '../../agents.module.css';

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

  useEffect(() => {
    if (!address || !publicClient) return;
    loadOwnedAgents({ address, publicClient })
      .then((agents) => {
        const selected = agents.find((item) => item.account.toLowerCase() === String(account).toLowerCase());
        setAgent(selected || null);
      })
      .catch((e) => setError(e.message));
  }, [address, publicClient, account]);

  async function waitForTask(taskId) {
    for (let attempt = 0; attempt < 35; attempt += 1) {
      const result = await apiJson(`${API_BASE}/api/v1/agent-admin/tasks/${taskId}`, { method: 'GET' });
      if (result.status !== 'pending') {
        const answer = result.result?.answer || result.result?.error || 'The agent finished processing the request.';
        setMessages((current) => [...current, { role: 'assistant', content: answer }]);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    setMessages((current) => [...current, {
      role: 'assistant',
      content: 'I’m still working on that. The next runtime wake will continue processing it.',
    }]);
  }

  async function sendChat() {
    if (!agent || !message.trim()) return;
    const submittedMessage = message.trim();
    setSending(true);
    setError('');
    try {
      await ensureOwnerSession({ address, account: agent.account, signMessageAsync });
      const result = await apiJson(`${API_BASE}/api/v1/agents/${agent.id}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: submittedMessage }),
      });
      setMessages((current) => [...current, { role: 'user', content: submittedMessage }]);
      setMessage('');
      if (result.taskId) await waitForTask(result.taskId);
    } catch (e) {
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
        <div className={styles.chat}>
          <div className={styles.chatHistory}>
            {messages.length ? messages.map((item, index) => (
              <div key={index} className={item.role === 'user' ? styles.chatUser : styles.chatAgent}>
                <span>{item.role === 'user' ? 'You' : agent.name}</span>
                <p>{item.content}</p>
              </div>
            )) : (
              <div className={styles.chatWelcome}>
                <strong>What do you want to know?</strong>
                <p>Ask about activity, strategy, balances, or what the agent is configured to do.</p>
              </div>
            )}
          </div>
        </div>

        <div className={styles.chatComposerLarge}>
          <input className={styles.input} value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) sendChat(); }} placeholder="Message your agent…" />
          <button className={styles.primaryButton} disabled={sending || !message.trim()} onClick={sendChat}>{sending ? 'Replying…' : 'Send'}</button>
        </div>
      </section>
    </main>
  );
}

export default function AgentChatPage() {
  return <Providers><AppShell><ChatContent /></AppShell></Providers>;
}
