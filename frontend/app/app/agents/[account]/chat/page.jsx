'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAccount, usePublicClient, useSignMessage } from 'wagmi';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import { loadOwnedAgents, API_BASE, apiJson, providerOptions } from '../../agentClient';
import styles from '../../agents.module.css';

function ChatContent() {
  const { account } = useParams();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { signMessageAsync } = useSignMessage();

  const [agent, setAgent] = useState(null);
  const [provider, setProvider] = useState('gemini');
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
        if (selected?.config?.autonomy?.provider) setProvider(selected.config.autonomy.provider);
      })
      .catch((e) => setError(e.message));
  }, [address, publicClient, account]);

  async function sendChat() {
    if (!agent || !message.trim()) return;
    setSending(true);
    setError('');
    try {
      const challenge = await apiJson(`${API_BASE}/api/v1/agent-admin/challenge`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ owner: address, account: agent.account, action: 'agent-chat' }),
      });
      const signature = await signMessageAsync({ message: challenge.message });
      const result = await apiJson(`${API_BASE}/api/v1/agents/${agent.id}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challengeToken: challenge.token, signature, message: message.trim(), provider }),
      });
      setMessages((current) => [...current, { role: 'user', content: message.trim() }, { role: 'assistant', content: result.answer }]);
      setMessage('');
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
          <select className={styles.input} value={provider} onChange={(e) => setProvider(e.target.value)}>
            {providerOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input className={styles.input} value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) sendChat(); }} placeholder="Ask your agent…" />
          <button className={styles.primaryButton} disabled={sending || !message.trim()} onClick={sendChat}>{sending ? 'Sending…' : 'Send'}</button>
        </div>
      </section>
    </main>
  );
}

export default function AgentChatPage() {
  return <Providers><AppShell><ChatContent /></AppShell></Providers>;
}
