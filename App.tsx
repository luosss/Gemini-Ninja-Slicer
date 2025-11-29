import React, { useState, useEffect } from 'react';
import MotionGame from './components/MotionGame';
import { GameState, SenseiFeedback } from './types';
import { getSenseiFeedback } from './services/geminiService';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [stats, setStats] = useState({ score: 0, sliced: 0, bombs: 0 });
  const [senseiFeedback, setSenseiFeedback] = useState<SenseiFeedback | null>(null);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // Settings State
  const [apiKey, setApiKey] = useState('');
  const [proxyUrl, setProxyUrl] = useState('');

  useEffect(() => {
    // Load settings from storage on mount
    setApiKey(localStorage.getItem('gemini_api_key') || '');
    setProxyUrl(localStorage.getItem('gemini_base_url') || '');
  }, []);

  const saveSettings = () => {
    localStorage.setItem('gemini_api_key', apiKey.trim());
    localStorage.setItem('gemini_base_url', proxyUrl.trim());
    setShowSettings(false);
  };

  const handleGameOver = async (score: number, sliced: number, bombs: number) => {
    setStats({ score, sliced, bombs });
    setGameState(GameState.GAME_OVER);
    
    // Fetch Gemini Feedback
    setLoadingFeedback(true);
    try {
      const feedback = await getSenseiFeedback(score, sliced, bombs);
      setSenseiFeedback(feedback);
    } catch (e) {
      console.error(e);
      setSenseiFeedback({ rank: "Error", message: "Sensei disconnected." });
    } finally {
      setLoadingFeedback(false);
    }
  };

  const startGame = () => {
    setGameState(GameState.PLAYING);
    setSenseiFeedback(null);
  };

  return (
    <div className="w-full h-screen bg-gray-900 text-white font-sans overflow-hidden">
      
      {/* Game Layer */}
      <div className="absolute inset-0 z-0">
         <MotionGame 
            gameState={gameState} 
            setGameState={setGameState} 
            onGameOver={handleGameOver} 
         />
      </div>

      {/* Menu Overlay */}
      {gameState === GameState.MENU && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
          
          {/* Settings Button */}
          <button 
            onClick={() => setShowSettings(true)}
            className="absolute top-6 left-6 p-3 bg-gray-800 rounded-full hover:bg-gray-700 transition-colors z-30 group"
            title="Settings"
          >
            <span className="text-2xl group-hover:rotate-90 transition-transform block duration-500">⚙️</span>
          </button>

          <h1 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600 mb-8 neon-text tracking-tighter italic transform -rotate-2">
            NINJA SLICER
          </h1>
          <p className="text-xl mb-12 text-gray-300 max-w-md text-center">
            Stand back, enable your camera, and wave your hands to slice the fruits! Avoid the bombs!
          </p>
          <button 
            onClick={startGame}
            className="px-12 py-6 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full text-2xl font-bold hover:scale-105 transition-transform shadow-lg shadow-green-500/50"
          >
            START TRAINING
          </button>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/90 backdrop-blur-md">
          <div className="bg-gray-800 p-8 rounded-2xl w-full max-w-md border border-gray-700 shadow-2xl">
            <h2 className="text-2xl font-bold mb-6 text-white flex items-center gap-2">
              <span>⚙️</span> Configuration
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Gemini API Key</label>
                <input 
                  type="password" 
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-700 focus:border-purple-500 focus:outline-none text-white font-mono"
                />
                <p className="text-xs text-gray-500 mt-1">Key is stored locally in your browser.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">API Base URL (Proxy) <span className="text-xs text-gray-500">(Optional)</span></label>
                <input 
                  type="text" 
                  value={proxyUrl}
                  onChange={(e) => setProxyUrl(e.target.value)}
                  placeholder="https://your-worker.dev"
                  className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-700 focus:border-purple-500 focus:outline-none text-white font-mono"
                />
                <p className="text-xs text-gray-500 mt-1">Use this if Google APIs are blocked in your region.</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8">
              <button 
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={saveSettings}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold transition-colors shadow-lg"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Over Overlay */}
      {gameState === GameState.GAME_OVER && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md animate-fade-in">
          <h2 className="text-5xl font-bold text-red-500 mb-2 tracking-widest uppercase">Game Over</h2>
          
          <div className="grid grid-cols-3 gap-8 mb-8 mt-4 text-center">
            <div className="flex flex-col">
               <span className="text-4xl font-mono text-yellow-400">{stats.score}</span>
               <span className="text-xs uppercase text-gray-500">Score</span>
            </div>
            <div className="flex flex-col">
               <span className="text-4xl font-mono text-green-400">{stats.sliced}</span>
               <span className="text-xs uppercase text-gray-500">Sliced</span>
            </div>
            <div className="flex flex-col">
               <span className="text-4xl font-mono text-red-400">{stats.bombs}</span>
               <span className="text-xs uppercase text-gray-500">Bombs</span>
            </div>
          </div>

          <div className="bg-gray-800 p-8 rounded-2xl max-w-lg w-full shadow-2xl border border-gray-700 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-blue-500"></div>
            <h3 className="text-xl font-bold text-purple-400 mb-4 flex items-center gap-2">
              <span>🧘‍♂️</span> Sensei's Evaluation
            </h3>
            
            {loadingFeedback ? (
              <div className="flex items-center justify-center space-x-2 py-8">
                <div className="w-3 h-3 bg-purple-500 rounded-full animate-bounce"></div>
                <div className="w-3 h-3 bg-purple-500 rounded-full animate-bounce delay-75"></div>
                <div className="w-3 h-3 bg-purple-500 rounded-full animate-bounce delay-150"></div>
                <span className="text-gray-400 ml-2">Meditating on your skills...</span>
              </div>
            ) : senseiFeedback ? (
              <div className="space-y-4 animate-slide-up">
                <div className="flex items-baseline justify-between border-b border-gray-700 pb-2">
                  <span className="text-gray-400">Rank</span>
                  <span className="text-2xl font-bold text-white tracking-wider">{senseiFeedback.rank}</span>
                </div>
                <p className="text-lg text-gray-200 italic">
                  "{senseiFeedback.message}"
                </p>
              </div>
            ) : (
              <p className="text-gray-500 italic">Sensei is silent.</p>
            )}
          </div>

          <button 
            onClick={startGame}
            className="mt-12 px-10 py-4 bg-white text-black rounded-full text-xl font-bold hover:bg-gray-200 transition-colors shadow-xl"
          >
            PLAY AGAIN
          </button>
        </div>
      )}
    </div>
  );
};

export default App;