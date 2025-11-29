import { GoogleGenAI, Type } from "@google/genai";
import { SenseiFeedback } from "../types";

// Helper to get config from browser storage
const getConfig = () => {
  return {
    apiKey: localStorage.getItem("gemini_api_key") || "",
    baseUrl: localStorage.getItem("gemini_base_url") || ""
  };
};

export const getSenseiFeedback = async (score: number, sliced: number, bombs: number): Promise<SenseiFeedback> => {
  const { apiKey, baseUrl } = getConfig();

  if (!apiKey) {
    return {
      rank: "Anonymous Ninja",
      message: "Please click the Settings (⚙️) icon to configure your Gemini API Key.",
    };
  }

  try {
    // Initialize AI instance dynamically with current settings
    const ai = new GoogleGenAI({ 
      apiKey: apiKey,
    }, {
      baseUrl: baseUrl || undefined // Only pass if set
    });

    const prompt = `
      You are a wise and slightly humorous Ninja Master.
      A student has just finished a fruit slicing training session.
      Stats:
      - Score: ${score}
      - Fruits Sliced: ${sliced}
      - Bombs Hit: ${bombs}

      Provide a brief evaluation.
      1. Assign a Rank based on performance (e.g., Peasant, Apprentice, Ninja, Master, Legend).
      2. Write a short, wise, or funny comment about their performance (max 20 words).
      3. Reply in the same language as the user's browser if possible, otherwise English.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            rank: { type: Type.STRING },
            message: { type: Type.STRING },
          },
          required: ["rank", "message"],
        },
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response from Sensei");
    }
    
    return JSON.parse(text) as SenseiFeedback;
  } catch (error) {
    console.error("Sensei is meditating (Error):", error);
    return {
      rank: "Disconnected Ronin",
      message: "Sensei cannot be reached. Check your API Key and Network/Proxy settings.",
    };
  }
};