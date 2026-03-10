const apiKey = "AIzaSyBSydHi1HAKVf1do7XLauJXjiQhJ6h1ZSc";

async function listModels() {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(url, { headers: { "Referer": "http://localhost:5173/" } });
    const data = await response.json();
    console.log(data.models?.map(m => m.name).join("\n"));
}

listModels();
