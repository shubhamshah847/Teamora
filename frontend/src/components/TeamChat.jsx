import FeedbackToast from './FeedbackToast.jsx'
import { io } from 'socket.io-client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AiTwotoneDelete } from "react-icons/ai";
import axios from 'axios'
import { SERVER_URI } from '../App.jsx';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin

// Merge two message lists, remove duplicates by _id, keep oldest -> newest
const mergeMessages = (a = [], b = []) => {
  const map = new Map()
    ;[...a, ...b].forEach((m) => map.set(m._id, m))
  return [...map.values()].sort(
    (x, y) => new Date(x.createdAt) - new Date(y.createdAt)
  )
}

function useTeamChat({ token, teams, selectedTeamId, user, apiRequest }) {
  const socketRef = useRef(null)
  const selectedTeamIdRef = useRef(selectedTeamId)
  const teamsRef = useRef(teams)
  selectedTeamIdRef.current = selectedTeamId
  teamsRef.current = teams
  const [messagesByTeam, setMessagesByTeam] = useState({})
  const [unreadByTeam, setUnreadByTeam] = useState({})
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')

  const addMessage = useCallback((message) => {
    setMessagesByTeam((current) => ({
      ...current,
      [message.teamId]: mergeMessages(current[message.teamId], [message]),
    }))
    if (
      String(message.userId) !== String(user?._id) &&
      String(message.teamId) !== String(selectedTeamIdRef.current)
    ) {
      setUnreadByTeam((current) => ({
        ...current,
        [message.teamId]: (current[message.teamId] || 0) + 1,
      }))
    }
  }, [user?._id])

  const removeMessage = useCallback(({ teamId, messageId }) => {
    setMessagesByTeam((current) => ({
      ...current,
      [teamId]: (current[teamId] || []).filter((message) => message._id !== messageId),
    }))
  }, [])

  const refreshMessages = useCallback(async () => {
    if (!selectedTeamId) return
    try {
      const data = await apiRequest(`/chat/teams/${selectedTeamId}/messages?limit=30`)
      setMessagesByTeam((current) => ({
        ...current,
        [selectedTeamId]: mergeMessages(data.messages, current[selectedTeamId]),
      }))
      setError('')
    } catch (requestError) {
      setError(requestError.message || String(requestError))
    }
  }, [selectedTeamId, apiRequest])

  useEffect(() => {
    if (!token) return
    const socket = io(SOCKET_URL, { auth: { token } })
    socketRef.current = socket

    const joinTeamRooms = () => {
      setConnected(true)
      setError('')
      teamsRef.current.forEach(({ _id: teamId }) => {
        socket.emit('join_team', { teamId }, (result) => {
          if (!result?.ok) setError(result?.error || 'Could not join team chat')
        })
      })
    }

    socket.on('connect', joinTeamRooms)
    socket.on('disconnect', () => setConnected(false))
    socket.on('connect_error', (socketError) => setError(socketError.message))
    socket.on('new_message', addMessage)
    socket.on('message_deleted', removeMessage)

    return () => {
      socket.off('connect', joinTeamRooms)
      socket.off('new_message', addMessage)
      socket.off('message_deleted', removeMessage)
      socket.disconnect()
      socketRef.current = null
    }
  }, [token, addMessage, removeMessage])

  useEffect(() => {
    const socket = socketRef.current
    if (!socket?.connected) return
    teams.forEach(({ _id: teamId }) => {
      socket.emit('join_team', { teamId }, (result) => {
        if (!result?.ok) setError(result?.error || 'Could not join team chat')
      })
    })
  }, [teams])


  useEffect(() => {
    if (!selectedTeamId) return
    setUnreadByTeam((current) => {
      if (!current[selectedTeamId]) return current
      const next = { ...current }
      delete next[selectedTeamId]
      return next
    })
    refreshMessages()
  }, [selectedTeamId, refreshMessages])

  const sendMessage = useCallback(
    async (content) => {
      const text = (content || '').trim()
      if (!text || !selectedTeamId) return false
      try {
        const message = await apiRequest(`/chat/teams/${selectedTeamId}/messages`, {
          method: 'POST',
          body: JSON.stringify({ content: text }),
        })
        addMessage(message)
        setError('')
        return true
      } catch (requestError) {
        setError(requestError.message || 'Failed to send message')
        return false
      }
    },
    [selectedTeamId, apiRequest, addMessage]
  )

  const messages = useMemo(
    () => messagesByTeam[selectedTeamId] || [],
    [messagesByTeam, selectedTeamId]
  )

  return { messages, messagesByTeam, unreadByTeam, sendMessage, refreshMessages, connected, error }
}

// 3. Send through the authenticated message API
export default function TeamChat({ token, user }) {
  const [teams, setTeams] = useState([])

  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showSummary,setShowSummary]=useState(false)

  const [summary, setSummary] = useState(null); 
  const bottomRef = useRef(null)



  // Keep chat requests on the deployed backend in production.
  const apiRequest = useCallback(
    async (path, options = {}) => {
      const res = await fetch(`${SERVER_URI}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...options.headers,
        },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Request failed')
      return data
    },
    [token]
  )
  const [showMessage, setShowMessage] = useState(false);
  const handleDelete = () => {
    setShowMessage(true);

    setTimeout(() => {
      setShowMessage(false);
    }, 3000);
  }
  const handleChatSummarize = async (teamId) => {
    const response = await axios.post(`${SERVER_URI}/chat/chat/message-summarize/${teamId}`,    {},  {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        withCredentials: true
      })
      setSummary(JSON.parse(response.data.message))
      setShowSummary(true)
    console.log(response)
  }
  const handleDeleteMessage = async (teamId) => {
    if (messages.length === 0) return console.log("no messages")
    try {

      // axios.post(url, data, config)


      const deleteMessageRequest = await axios.delete(`${SERVER_URI}/chat/teams/${teamId}/delete-chat`,{},
        {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        withCredentials: true
      }
      )
      handleDelete();
      refreshMessages()
    }
    catch (err) {
      setError(err.response?.data?.message || 'Unable to delete chat history')
      console.log(err)
    }
  }


  const {
    messages,
    messagesByTeam,
    unreadByTeam,
    sendMessage,
    refreshMessages,
    connected,
    error: chatError,
  } = useTeamChat({ token, teams, selectedTeamId, user, apiRequest })

  // Load the user's teams
  useEffect(() => {
    let active = true
    apiRequest('/teams')
      .then((data) => {
        if (!active) return
        const nextTeams = data.teams || []
        setTeams(nextTeams)
        setSelectedTeamId((current) => current || nextTeams[0]?._id || '')
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || String(requestError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [apiRequest])

  // Scroll to the newest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const selectedTeam = teams.find((team) => team._id === selectedTeamId)
  const filteredTeams = teams.filter((team) =>
    team.name?.toLowerCase().includes(search.toLowerCase())
  )
  const memberCount = selectedTeam?.members?.length || (selectedTeam ? 1 : 0)

  const isMine = (message) => String(message.userId) === String(user?._id)
  const senderName = (message) => {
    const senderId = String(message.userId)
    if (senderId === String(user?._id)) return user?.name || user?.fullName || user?.email || 'You'
    if (String(selectedTeam?.owner?._id || selectedTeam?.owner) === senderId) {
      return selectedTeam?.owner?.name || 'Team owner'
    }
    const member = selectedTeam?.members?.find(
      (item) => String(item.user?._id || item.user || item._id) === senderId
    )
    return member?.user?.name || member?.name || 'Member'
  }
  const formatTime = (iso) =>
    new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  const handleSubmit = async (event) => {
    event.preventDefault()
    const ok = await sendMessage(draft)
    if (ok) setDraft('') // clear only if the server accepted it
  }

  if (loading) return <p>Loading...</p>
  
const ChatSummaryModal = ({ summary, onClose }) => {
  if (!summary) return null;

  const Section = ({ icon, title, count, children }) => (
    <section className="summary-modal-section">
      <div className="summary-modal-section-heading">
        <h3 className="summary-modal-section-title">
          <span className="summary-modal-section-icon">{icon}</span>
          {title}
        </h3>
        <span className="summary-modal-count">
          {count}
        </span>
      </div>
      {children}
    </section>
  );

  const Empty = () => (
    <p className="summary-modal-empty">Nothing to report here.</p>
  );

  return (
    <div
      onClick={onClose}
      className="summary-modal-overlay"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="summary-modal"
      >
        {/* Header */}
        <div className="summary-modal-header">
          <div>
            <div className="summary-modal-kicker">
              <span className="summary-modal-spark">✦</span>
              <span>Conversation brief</span>
            </div>
            <h2 className="summary-modal-title">AI Catch-up</h2>
            <p className="summary-modal-subtitle">Here&apos;s what happened while you were away.</p>
          </div>

          <button
            onClick={onClose}
            className="summary-modal-close"
            aria-label="Close summary"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {/* Content */}
        <div className="summary-modal-body">

          {/* Summary */}
          <div className="summary-modal-overview">
            <p className="summary-modal-overview-label">
              Overview
            </p>
            <p className="summary-modal-overview-text">
              {summary.summary}
            </p>
          </div>

          {/* Decisions */}
          <Section
            icon="🤝"
            title="Team Decisions"
            count={summary.decisions?.length || 0}
          >
            {summary.decisions?.length ? (
              <div className="space-y-3">
                {summary.decisions.map((item, i) => (
                  <div key={i} className="summary-modal-list-item summary-modal-decision">
                    <p className="summary-modal-item-text">{item.text}</p>
                    <p className="summary-modal-item-meta">
                      Agreed by {item.by}
                    </p>
                  </div>
                ))}
              </div>
            ) : <Empty />}
          </Section>

          {/* Questions */}
          <Section
            icon="💬"
            title="Questions for you"
            count={summary.questions_for_viewer?.length || 0}
          >
            {summary.questions_for_viewer?.length ? (
              <div className="space-y-3">
                {summary.questions_for_viewer.map((item, i) => (
                  <div key={i} className="summary-modal-list-item summary-modal-question">
                    <p className="summary-modal-item-text">{item.text}</p>
                    <p className="summary-modal-item-meta">
                      From {item.from}
                    </p>
                  </div>
                ))}
              </div>
            ) : <Empty />}
          </Section>

          {/* Action Items */}
          <Section
            icon="📌"
            title="Action Items"
            count={summary.action_items?.length || 0}
          >
            {summary.action_items?.length ? (
              <div className="space-y-3">
                {summary.action_items.map((item, i) => (
                  <div key={i} className="summary-modal-list-item summary-modal-action">
                    <span className="summary-modal-action-mark">✓</span>
                    <div className="summary-modal-action-copy">
                      <p className="summary-modal-item-text">{item.text}</p>
                      <div className="summary-modal-item-details">
                        <span>
                          {item.owner || "Unassigned"}
                        </span>
                        {item.due && (
                          <span>
                            Due {item.due}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <Empty />}
          </Section>

          {/* Important */}
          <Section
            icon="🚨"
            title="Important Updates"
            count={summary.important?.length || 0}
          >
            {summary.important?.length ? (
              <div className="space-y-3">
                {summary.important.map((item, i) => (
                  <div key={i} className="summary-modal-list-item summary-modal-important">
                    <p className="summary-modal-item-text">{item.text}</p>
                  </div>
                ))}
              </div>
            ) : <Empty />}
          </Section>
        </div>

        {/* Footer */}
        <div className="summary-modal-footer">
          <button
            onClick={onClose}
            className="summary-modal-done"
          >
            Close summary
          </button>
        </div>
      </div>
    </div>
    
  );
};


  return (
    <div className="page-panel chat-page">
      <div className="page-header chat-page-heading">
        <div>
          <span className="eyebrow">Workspace conversations</span>
          <h2>Team chat</h2>
          <p className="page-subtitle">One shared space to keep every team in sync.</p>
        </div>
        <div className="chat-heading-badge">
          <span className="chat-heading-dot" /> {teams.length} {teams.length === 1 ? 'team' : 'teams'}
        </div>
      </div>

      <FeedbackToast message={error || chatError} />

      {showSummary && (
        <ChatSummaryModal
          summary={summary}
          onClose={() => setShowSummary(false)}
        />
      )}


      <section className="team-chat-layout" aria-label="Team chat">
        <aside className="chat-team-sidebar">
          <div className="chat-sidebar-heading">
            <div>
              <span className="eyebrow">Your spaces</span>
              <h3>Conversations</h3>
            </div>
            <span className="chat-count-badge">{teams.length}</span>
          </div>

          <label className="chat-search-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Find a team"
              aria-label="Find a team"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search">×</button>
            )}
          </label>

          <div className="chat-team-list">
            {filteredTeams.length === 0 ? (
              <div className="chat-sidebar-empty">
                {teams.length
                  ? 'No teams match your search.'
                  : 'Your teams will appear here once you create or join one.'}
              </div>
            ) : (
              filteredTeams.map((team, index) => {
                const lastMessage = messagesByTeam[team._id]?.at(-1)
                return (
                  <div
                    key={team._id}
                    className={`chat-team-item ${selectedTeamId === team._id ? 'active' : ''}`}
                    onClick={() => setSelectedTeamId(team._id)}
                  ><p></p>
                    <span className={`chat-team-avatar chat-avatar-tone-${index % 5}`}>
                      {team.name?.charAt(0)?.toUpperCase() || 'T'}
                    </span>

                    <span className="chat-team-copy">
                      <strong>{team.name}</strong>

                      <span>
                        {lastMessage?.content || team.description || 'Start a conversation'}
                      </span>
                    </span>

                    <span className="chat-team-meta">
                      <small>{lastMessage ? formatTime(lastMessage.createdAt) : ''}</small>

                      {unreadByTeam[team._id] > 0 && (
                        <span className="chat-unread-badge">
                          {unreadByTeam[team._id] > 4 ? '4+' : unreadByTeam[team._id]}
                        </span>
                      )}

                      <button
                        type="button"
                        className="delete-chat-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteMessage(team._id);
                        }}
                        title="Delete chat"
                      >
                        <AiTwotoneDelete size={19} color="red" />
                      </button>
                    </span>
                  </div>
                )
              })
            )}
          </div>

          <div className="chat-sidebar-note">
            <span className="chat-note-icon">✦</span>
            <p>
              <strong>Good work happens together.</strong>
              <br />
              Pick a team and share an update.
            </p>
          </div>
        </aside>

        {!selectedTeam ? (
          <div className="chat-empty-main">
            <div className="chat-empty-symbol">✉</div>
            <span className="eyebrow">Team conversations</span>
            <h3>{teams.length ? 'Choose a team to get started' : 'Create your first team'}</h3>
            <p>
              {teams.length
                ? 'Select a conversation from the sidebar to see messages.'
                : 'Once you have a team, its members can gather here and keep work moving.'}
            </p>
          </div>
        ) : (
          <div className="chat-conversation">
            <header className="chat-conversation-header">
              <div className="chat-conversation-identity">
                <span className="chat-team-avatar chat-avatar-large">
                  {selectedTeam.name?.charAt(0)?.toUpperCase() || 'T'}
                </span>
                <div>
                  <h3>{selectedTeam.name || "not found"}</h3>

                  <p>
                    {selectedTeam.description || 'Team conversation'}{' '}
                    <span className="chat-header-separator">·</span> {memberCount}{' '}
                    {memberCount === 1 ? 'member' : 'members'}
                    {!connected && ' · offline'}
                  </p>

                </div>
                {showMessage && (
                  <div className="bg-green-100 text-green-700 px-4 py-2 rounded-lg mt-3">
                    Message deleted successfully!
                  </div>
                )}
              </div>

              <button onClick={()=>{
                handleChatSummarize(selectedTeam._id)
              }} className="group relative inline-flex items-center justify-center overflow-hidden rounded-lg border border-blue-200 bg-white px-6 py-2.5 font-semibold text-blue-600 shadow-sm transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/30 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95">
                <span className="absolute inset-0 h-full w-full scale-0 rounded-lg bg-blue-600 opacity-0 transition-all duration-300 ease-out group-hover:scale-100 group-hover:opacity-100"></span>
                <span className="relative flex items-center gap-2 transition-colors duration-300 group-hover:text-white">
                  <GiMonoWheelRobot size="28" color="red" />
                  Summarize
                </span>
              </button>
              <button type="button" className="chat-header-action" title="Refresh messages" aria-label="Refresh messages" onClick={refreshMessages}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 7v5h-5M4 17v-5h5" />
                  <path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2" />
                </svg>
              </button>
            </header>

            <div className="chat-message-area" aria-live="polite">
              <div className="chat-day-divider">
                <span /> <small>{messages.length ? 'Conversation' : 'A new beginning'}</small> <span />
              </div>

              {messages.length === 0 ? (
                <div className="chat-welcome">
                  <div className="chat-welcome-avatar">
                    {selectedTeam.name?.charAt(0)?.toUpperCase() || 'T'}
                  </div>
                  <h3>Welcome to {selectedTeam.name}</h3>
                  <p>This is the beginning of your team conversation. Share a thought, an update, or a quick hello.</p>
                </div>
              ) : (
                messages.map((message, index) => {
                  const mine = isMine(message)
                  const name = senderName(message)
                  return (
                    <article
                      className={`chat-message ${mine ? 'mine' : ''} new-sender`}
                      key={message._id}
                    >
                      {!mine && (
                        <span className="chat-message-avatar">{name.charAt(0).toUpperCase()}</span>
                      )}
                      <div className="chat-message-content">
                        <div className="chat-message-meta">
                          <strong>{name}</strong>
                          <time>{formatTime(message.createdAt)}</time>
                        </div>
                        <p>{message.content}</p>
                      </div>
                    </article>
                  )
                })
              )}
              <div ref={bottomRef} />
            </div>

            <form className="chat-composer" onSubmit={handleSubmit}>
              <label className="chat-composer-input">
                <span className="sr-only">Write a message</span>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      event.currentTarget.form.requestSubmit()
                    }
                  }}
                  placeholder="Send a message..."
                  rows="1"
                  maxLength={2000}
                />
              </label>

              <div className="chat-composer-footer">
                <span>Enter to send</span>
                <button
                  type="submit"
                  className="chat-send-button"
                  disabled={!draft.trim()}
                  aria-label="Send message"
                >
                  <span>Send</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m22 2-7 20-4-9-9-4Z" />
                    <path d="M22 2 11 13" />
                  </svg>
                </button>
              </div>
            </form>

          </div>
        )}
      </section>

    </div>
  )
}