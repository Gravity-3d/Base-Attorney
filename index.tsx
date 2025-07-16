import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import { GoogleGenAI, Chat } from "@google/genai";

const VsAiPage = () => {
  const [debateHistory, setDebateHistory] = useState([]);
  const [userInput, setUserInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const chatRef = useRef<Chat | null>(null);
  const dialogueEndRef = useRef<HTMLDivElement | null>(null);

  const TOPIC = "Is a hot dog a sandwich?";

  useEffect(() => {
    // Initialize the chat session
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      chatRef.current = ai.chats.create({
        model: "gemini-2.5-flash",
        config: {
          systemInstruction:
            "You are a ruthless, cunning, and slightly dramatic prosecutor in a courtroom parody game. Your name is Miles Edgeworth. The user is the defense attorney. You are debating a mundane topic. Your goal is to counter the user's arguments with sharp logic and flair. Keep your responses dramatic, in character, and relatively short (2-4 sentences). Never break character.",
        },
      });

      setDebateHistory([
        {
          speaker: "Judge",
          text: `Court is now in session. Today's topic: ${TOPIC}`,
        },
      ]);
    } catch (error) {
       console.error("Error initializing AI chat:", error);
       setDebateHistory([
        {
          speaker: "Error",
          text: "Failed to initialize the AI. Please check the API key and refresh.",
        },
      ]);
    }
  }, []);

  useEffect(() => {
    // Scroll to the bottom of the dialogue box
    dialogueEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [debateHistory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim() || isLoading || !chatRef.current) return;

    const userMessage = { speaker: "Defense", text: userInput };
    setDebateHistory((prev) => [...prev, userMessage]);
    setUserInput("");
    setIsLoading(true);

    try {
      const response = await chatRef.current.sendMessage({ message: userInput });
      const aiMessage = { speaker: "Prosecutor", text: response.text };
      setDebateHistory((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage = {
        speaker: "Error",
        text: "The prosecutor seems to be flustered. An error occurred.",
      };
      setDebateHistory((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <h2 className="text-2xl md:text-3xl font-bold mb-6 text-center title-text" style={{ textShadow: '4px 4px 0 #000' }}>
        Topic: {TOPIC}
      </h2>

      <div id="courtroom-scene" className="relative w-full max-w-4xl h-48 md:h-64 mb-6 bg-gray-700 border-4 border-black rounded-lg">
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-16 bg-gray-800 border-4 border-black rounded-t-lg flex items-center justify-center text-xs text-center p-1">Judge's Bench</div>
        <div className="absolute bottom-2 left-8 w-40 h-20 bg-blue-800 border-4 border-black rounded-lg flex items-center justify-center text-center p-2">Defense Bench</div>
        <div className="absolute bottom-2 right-8 w-40 h-20 bg-red-800 border-4 border-black rounded-lg flex items-center justify-center text-center p-2">Prosecution Bench</div>
      </div>

      <div id="dialogue-box" className="w-full max-w-4xl h-72 bg-gray-900 bg-opacity-75 border-4 border-white p-4 overflow-y-auto text-lg md:text-xl leading-relaxed">
        {debateHistory.map((entry, index) => (
          <div key={index} className="mb-4">
            <span
              className={`font-bold ${
                entry.speaker === "Defense"
                  ? "text-blue-400"
                  : entry.speaker === "Prosecutor"
                  ? "text-red-400"
                  : "text-yellow-300"
              }`}
            >
              {entry.speaker}:
            </span>{" "}
            {entry.text}
          </div>
        ))}
        {isLoading && (
            <div className="mb-4">
                <span className="font-bold text-red-400">Prosecutor:</span> Thinking...
            </div>
        )}
        <div ref={dialogueEndRef} />
      </div>
      
      <form onSubmit={handleSubmit} className="w-full max-w-4xl mt-6">
        <textarea
          id="argument-input"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          className="form-input w-full h-28 resize-none text-lg"
          placeholder="Present your argument..."
          disabled={isLoading}
          aria-label="Your argument"
        />
        <div className="flex justify-between items-center mt-4">
            <button type="button" className="btn text-3xl md:text-5xl !py-4 !px-8 border-red-500 !text-red-500 hover:!border-red-400 hover:!text-red-400" style={{ boxShadow: '6px 6px 0px #5B21B6' }}>
                OBJECTION!
            </button>
            <button type="submit" className="btn text-xl md:text-2xl" disabled={isLoading}>
                {isLoading ? "Waiting..." : "Present Argument"}
            </button>
        </div>
      </form>
    </>
  );
};


if (window.location.pathname.endsWith('/vs-ai.html')) {
    const container = document.getElementById('root');
    if (container) {
        const root = ReactDOM.createRoot(container);
        root.render(
            <React.StrictMode>
                <VsAiPage />
            </React.StrictMode>
        );
    }
}
