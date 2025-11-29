import { GoogleGenAI, Type } from "@google/genai";
import { SenseiFeedback } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getSenseiFeedback = async (score: number, sliced: number, bombs: number): Promise<SenseiFeedback> => {
  try {
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
      rank: "Unknown",
      message: "My mind is clouded. I cannot see your future right now.",
    };
  }
};