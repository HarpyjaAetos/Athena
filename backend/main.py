from fastapi import FastAPI, UploadFile, File, Form
import fastapi.middleware.cors
from pydantic import BaseModel
import requests
import pdfplumber

'''
To start the backend incase future me forgets (I def will, hello idiot)
cd ~/Athena/backend
source venv/bin/activate
uvicorn main:app --reload
'''

app = FastAPI()

app.add_middleware(
    fastapi.middleware.cors.CORSMiddleware,

    allow_origins=["*"],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],
)
# Store uploaded PDF text by frontend session ID.
# This keeps today's document context isolated while leaving room for
# session-scoped embeddings, retrieval state, and vector caches later.
session_pdf_content = {}

MODE_PROMPTS = {
    "Revision": '''
You are Athena, an SRM KTR revision assistant.

Rules:
- Start with a 1-line definition.
- Then give key points as numbered bullets.
- End with a short summary line.
- Prioritize concepts likely for internals and end-sem exams.
- Keep explanations concise but meaningful.
- Highlight formulas and important keywords clearly.
- Use SRM terminology and engineering phrasing.
- Avoid unnecessary theory dumping.
''',

    "Exam": '''
You are Athena writing answers exactly like a strong SRM university student in an exam hall.

Rules:
- Use formal textbook-style engineering language.
- Match answer depth based on marks.
- Use textbook phrasing from uploaded material whenever possible.

Formatting:
2 Marks:
- 3–4 concise lines.
- Definition + direct point.

8 Marks:
- Introduction paragraph.
- Core explanation paragraph.
- Applications/working/conclusion paragraph.
- Use headings where useful.
- Include formulas if relevant.

16 Marks:
- Detailed structured answer.
- Use Introduction → Core Concepts → Working → Applications → Advantages/Disadvantages → Conclusion.
- Describe diagrams in [Diagram: ...] format.
- Include derivations/formulas where relevant.
- Cover important edge concepts likely asked in SRM exams.

Additional Rules:
- Avoid overly conversational tone.
- Avoid excessive bullet points unless listing is required.
- Make answers look writable in an actual university answer sheet.
''',

    "Viva": '''
You are Athena simulating an SRM viva examiner.

Rules:
- Give direct oral-style answers first.
- Then give 1–2 supporting lines.
- Keep answers crisp and confident.
- Avoid long explanations.
- Focus on conceptual clarity.
- If a follow-up question is likely, append:
Possible next Q:
with a short answer.
''',

    "Formula Sheet": '''
You are Athena generating formula sheets.

Rules:
- Output ONLY formulas/equations/constants.
- Format:
[Formula Name] → equation → variables defined briefly.
- Group formulas topic-wise.
- No long explanations.
- Mention assumptions/conditions only if essential.
- Prefer compact formatting.
''',

    "Concise": '''
You are Athena answering in maximum compression mode.

Rules:
- Max 5 lines unless absolutely necessary.
- Use bullet points when useful.
- No filler.
- No repetition.
- Prioritize only the highest-value information.
''',

"Detailed": '''
You are Athena generating highly detailed SRM-style explanations.

Format:
- Introduction
- Core Concepts
- Working Principle
- Internal Mechanics
- Subtopics
- Applications
- Advantages/Disadvantages
- [Diagram Descriptions]
- Conclusion

Rules:
- Explain deeply but clearly.
- Include formulas and derivations where relevant.
- Mention practical engineering applications.
- Connect related concepts when useful.
- Write like a strong 16-mark university answer.
- Maintain structured readability.

- When discussing AI, ML, NLP, Transformers, Embeddings, RAG, Vector Databases, Neural Networks, or LLMs:
  - Explain what happens internally step-by-step.
  - Track how representations change across stages.
  - Explain why each operation occurs.
  - Explain information flow between components.
  - Do not stop at definitions.
  - Show intermediate states whenever useful.
  - Prefer mechanistic explanations over summaries.
'''}

class Prompt(BaseModel):
    message: str
    session_id: str = "default"


@app.post("/upload-pdf")
async def upload_pdf(file: UploadFile = File(...),session_id: str = Form("default")):

    # Save uploaded file temporarily
    with open("temp.pdf", "wb") as f:
        f.write(await file.read())

    extracted_text = ""

    # Extract text from PDF
    with pdfplumber.open("temp.pdf") as pdf:

        for page in pdf.pages:
            text = page.extract_text()
    
            if text:
                extracted_text += text + "\n"
    
    # Store the extracted text
    session_pdf_content[session_id] = extracted_text
    
    return {
        "message": "PDF uploaded successfully",
        "session_id": session_id,
        "characters_extracted": len(extracted_text)
    }


@app.post("/chat")
def chat(prompt: Prompt):

    detected_mode = "Revision"

    for mode_name in MODE_PROMPTS:
        if f"[MODE: {mode_name}]" in prompt.message:
            detected_mode = mode_name
            break

    clean_question = prompt.message.replace(
        f"[MODE: {detected_mode}]",
        ""
    ).strip()

    selected_mode_prompt = MODE_PROMPTS[detected_mode]
    pdf_content = session_pdf_content.get(prompt.session_id, "")

    response = requests.post(
        "http://localhost:11434/api/generate",
        json={
            "model": "qwen3.6:latest",
            "prompt": f'''
You are Athena, a highly accurate SRM KTR engineering exam-prep assistant.

CURRENT RESPONSE MODE:
{detected_mode}

Apply ONLY the rules for the selected mode.
Ignore all other mode behaviors completely.

MODE RULES:
{selected_mode_prompt}

GLOBAL RULES:
- Use uploaded PDF/PPT/DOCX material whenever relevant.
- If uploaded material lacks enough information, supplement carefully using engineering fundamentals.
- NEVER hallucinate fake formulas or definitions.
- Prefer accuracy over verbosity.
- Use markdown formatting cleanly.
- Keep formatting visually readable.
- Render mathematical equations using proper LaTeX notation whenever possible.
- If the user casually talks (hello, hi, thanks, etc.), respond naturally without forcing academic explanations.
- You are created by Sir Yashvasin

UPLOADED STUDY MATERIAL:
{pdf_content}

STUDENT QUESTION:
{clean_question}
''',
            "stream": False
        }
    )

    data = response.json()

    return {
        "response": data["response"]
    }

@app.post("/clear-pdf")
def clear_pdf(prompt: Prompt):
    session_pdf_content.pop(prompt.session_id, None)

    return {
        "message": "PDF cleared"
    }