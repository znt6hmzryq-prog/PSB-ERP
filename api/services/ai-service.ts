type AIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function askAI(messages: AIMessage[]) {

  const apiKey = process.env.OPENAI_API_KEY;

  const response = await fetch(
    "https://api.openai.com/v1/chat/completions",
    {
      method:"POST",

      headers:{
        "Content-Type":"application/json",
        Authorization:`Bearer ${apiKey}`
      },

      body:JSON.stringify({

        model:"gpt-4o-mini",

        messages,

        temperature:0.4

      })
    }
  );

  if(!response.ok){

    const text=await response.text();

    console.log("[AI ERROR]",text);

    throw new Error("AI request failed");
  }

  return await response.json();
}