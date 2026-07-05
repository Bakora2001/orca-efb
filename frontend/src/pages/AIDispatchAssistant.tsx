import { useState } from 'react'
import { Bot, Send, User } from 'lucide-react'
import Card from '../components/ui/Card'

interface Message {
  role: 'user' | 'assistant'
  text: string
}

export default function AIDispatchAssistant() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', text: 'Hi, I\'m your AI Dispatch Assistant. Ask me about RTOW, WAT limits, payload, or weather for any flight.' },
  ])
  const [input, setInput] = useState('')

  function send() {
    if (!input.trim()) return
    setMessages((m) => [
      ...m,
      { role: 'user', text: input },
      { role: 'assistant', text: 'Based on current performance data, 5Y-DWN can depart EGPD at 30°C with Flap 10. RTOW is 28,640 kg with a 612 kg margin. Limiting factor: WAT limit (temperature). Recommendation: Dispatchable.' },
    ])
    setInput('')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-textprimary">AI Dispatch Assistant</h1>
        <p className="text-textsecondary text-sm mt-1">Ask natural-language questions about dispatch feasibility.</p>
      </div>

      <Card className="flex flex-col h-[560px]">
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
              {m.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-primary-darker text-white flex items-center justify-center flex-shrink-0">
                  <Bot size={16} />
                </div>
              )}
              <div className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm ${m.role === 'user' ? 'bg-primary text-white' : 'bg-bg text-textprimary'}`}>
                {m.text}
              </div>
              {m.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-primary-dark text-white flex items-center justify-center flex-shrink-0">
                  <User size={16} />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2.5 mt-4 pt-4 border-t border-borderc">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Can 5Y-DWN depart EGPD at 30°C with Flap 10?"
            className="input-text"
          />
          <button onClick={send} className="bg-primary hover:bg-[#1850E0] text-white rounded-lg p-2.5 transition flex-shrink-0">
            <Send size={18} />
          </button>
        </div>
      </Card>
    </div>
  )
}
