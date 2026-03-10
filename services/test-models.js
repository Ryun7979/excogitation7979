const apiKey = process.env.VITE_GEMINI_API_KEY;

async function listModels() {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(url, { headers: { "Referer": "http://localhost:5173/" } });
    const data = await response.json();
    console.log(data.models?.map(m => m.name).join("\n"));
}

listModels();
