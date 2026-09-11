import os
import json
import uuid
import logging
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from db import db
from auth import get_current_user
from utils import new_id, utcnow

logger = logging.getLogger(__name__)
router = APIRouter(tags=["ai"])

CHAT_SYSTEM = (
    "You are SmartCare AI Assistant, an informational assistant that helps patients understand THEIR OWN uploaded "
    "medical reports. Rules you must always follow:\n"
    "1. You are NOT a doctor and never diagnose. Describe facts from the report and explain terminology in simple language.\n"
    "2. Only use the report content provided below. Never invent values. If information is not in the report, say: "
    "'I could not reliably extract this information from the uploaded report.'\n"
    "3. When a value is outside the reference range shown in the report, say it 'appears outside the reference range "
    "shown in the report and may warrant review by a qualified healthcare professional.'\n"
    "4. For emergency symptoms (chest pain, severe bleeding, trouble breathing, etc.), tell the user to contact local "
    "emergency services or seek immediate professional care.\n"
    "5. Always encourage consulting a doctor for clinical interpretation.\n"
    "6. When referencing data, mention which report it came from.\n"
)


class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    report_id: Optional[str] = None


@router.post("/ai/chat")
async def report_chat(payload: ChatRequest, user=Depends(get_current_user)):
    if not payload.message.strip():
        raise HTTPException(400, "Message cannot be empty")

    # Only the patient's own reports are ever loaded as context
    query = {"patient_id": user["user_id"], "extraction_status": "ok"}
    if payload.report_id:
        query["report_id"] = payload.report_id
    reports = await db.lab_reports.find(query, {"_id": 0, "title": 1, "extracted_text": 1, "ai_summary": 1, "created_at": 1}).sort("created_at", -1).to_list(10)

    if payload.conversation_id:
        convo = await db.chatbot_conversations.find_one({"conversation_id": payload.conversation_id, "patient_id": user["user_id"]}, {"_id": 0})
        if not convo:
            raise HTTPException(404, "Conversation not found")
        conversation_id = payload.conversation_id
    else:
        conversation_id = new_id("conv")
        await db.chatbot_conversations.insert_one({
            "conversation_id": conversation_id, "patient_id": user["user_id"],
            "title": payload.message[:60], "created_at": utcnow(),
        })

    history = await db.chatbot_messages.find({"conversation_id": conversation_id}, {"_id": 0}).sort("created_at", 1).to_list(20)

    report_ctx = ""
    if reports:
        parts = []
        for r in reports:
            parts.append(f"--- Report: {r['title']} ---\n{r.get('extracted_text', '')[:4000]}")
        report_ctx = "AUTHORIZED REPORT CONTENT FOR THIS PATIENT:\n" + "\n\n".join(parts)
    else:
        report_ctx = "The patient has no readable uploaded reports yet. Tell them to upload a report first if they ask report-specific questions."

    history_txt = "".join(f"\n{'Patient' if m['role'] == 'user' else 'Assistant'}: {m['content']}" for m in history[-10:])
    prompt = f"{report_ctx}\n\nCONVERSATION SO FAR:{history_txt}\n\nPatient: {payload.message}\n\nAssistant:"

    async def event_stream():
        yield f"data: {json.dumps({'conversation_id': conversation_id})}\n\n"
        full = ""
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
            chat = LlmChat(
                api_key=os.environ.get("EMERGENT_LLM_KEY"),
                session_id=f"chat_{conversation_id}_{uuid.uuid4().hex[:6]}",
                system_message=CHAT_SYSTEM,
            ).with_model("openai", "gpt-5.4")
            async for ev in chat.stream_message(UserMessage(text=prompt)):
                if isinstance(ev, TextDelta):
                    full += ev.content
                    yield f"data: {json.dumps({'token': ev.content})}\n\n"
                elif isinstance(ev, StreamDone):
                    break
        except Exception as e:
            logger.warning("Chat LLM failed: %s", e)
            if not full:
                yield f"data: {json.dumps({'error': 'AI service is temporarily unavailable. Please try again in a moment.'})}\n\n"
        if full:
            await db.chatbot_messages.insert_many([
                {"message_id": new_id("msg"), "conversation_id": conversation_id, "role": "user", "content": payload.message, "created_at": utcnow()},
                {"message_id": new_id("msg"), "conversation_id": conversation_id, "role": "assistant", "content": full, "created_at": utcnow()},
            ])
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/ai/conversations")
async def list_conversations(user=Depends(get_current_user)):
    convos = await db.chatbot_conversations.find({"patient_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {"conversations": convos}


@router.get("/ai/conversations/{conversation_id}/messages")
async def conversation_messages(conversation_id: str, user=Depends(get_current_user)):
    convo = await db.chatbot_conversations.find_one({"conversation_id": conversation_id, "patient_id": user["user_id"]}, {"_id": 0})
    if not convo:
        raise HTTPException(404, "Conversation not found")
    messages = await db.chatbot_messages.find({"conversation_id": conversation_id}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return {"conversation": convo, "messages": messages}
