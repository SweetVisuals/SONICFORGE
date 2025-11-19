
import { GoogleGenAI } from "@google/genai";
import { PluginModuleState, PluginType } from "../types";

const getAi = () => {
    if (!process.env.API_KEY) {
        console.warn("API_KEY not set");
        return null;
    }
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const generatePluginCode = async (
    modules: PluginModuleState[], 
    userPrompt: string = "", 
    pluginName: string = "MyPlugin"
) => {
  const ai = getAi();
  if (!ai) return { cppCode: "// API Key missing", headerCode: "", explanation: "Please set API_KEY" };

  const moduleDescriptions = modules.map(m => `${m.type} (Settings: ${JSON.stringify(m.params)})`).join(', ');

  const prompt = `
    You are an expert DSP audio engineer. Write the C++ JUCE framework code for a VST3 plugin named "${pluginName}".
    
    System Architecture:
    - The plugin chain includes: ${moduleDescriptions}.
    
    User Customization Request:
    "${userPrompt}"
    
    Please provide:
    1. The 'processBlock' function for PluginProcessor.cpp (ensure it handles the chain logic).
    2. The private member variables for PluginProcessor.h.
    
    Format the response purely as a JSON object with keys: "cppCode", "headerCode", "explanation".
    Do not include markdown code blocks in the JSON string values.
  `;

  try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: "application/json"
        }
      });
      
      const text = response.text;
      if (!text) throw new Error("No response");
      return JSON.parse(text);
  } catch (e) {
      console.error(e);
      return {
          cppCode: "// Error generating code",
          headerCode: "// Error generating code",
          explanation: "Failed to contact Gemini API."
      };
  }
};
