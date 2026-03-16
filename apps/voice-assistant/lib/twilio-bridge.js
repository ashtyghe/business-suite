import WebSocket from "ws";
import { TOOLS, handleToolCall } from "./tools.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17";

/**
 * Handles a single Twilio media stream WebSocket connection.
 * Bridges audio between Twilio (mulaw 8kHz) and OpenAI Realtime API.
 */
export function handleMediaStream(twilioWs) {
  let streamSid = null;
  let callSid = null;
  let caller = "unknown";
  let openaiWs = null;

  // ── Connect to OpenAI Realtime API ────────────────────────────────────────
  openaiWs = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  openaiWs.on("open", () => {
    console.log("🤖 Connected to OpenAI Realtime API");

    // Configure the session
    openaiWs.send(JSON.stringify({
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        instructions: SYSTEM_PROMPT,
        voice: "alloy",
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        input_audio_transcription: { model: "whisper-1" },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 600,
        },
        tools: TOOLS,
        tool_choice: "auto",
        temperature: 0.7,
      },
    }));

    // Send initial greeting
    openaiWs.send(JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "The call has just connected. Greet the caller warmly and ask how you can help." }],
      },
    }));
    openaiWs.send(JSON.stringify({ type: "response.create" }));
  });

  openaiWs.on("message", async (data) => {
    const event = JSON.parse(data.toString());

    switch (event.type) {
      // ── Audio from OpenAI → send to Twilio ──────────────────────────────
      case "response.audio.delta":
        if (streamSid && event.delta) {
          twilioWs.send(JSON.stringify({
            event: "media",
            streamSid,
            media: { payload: event.delta },
          }));
        }
        break;

      // ── Function call requested ─────────────────────────────────────────
      case "response.function_call_arguments.done":
        console.log(`🔧 Tool call: ${event.name}(${event.arguments})`);
        try {
          const args = JSON.parse(event.arguments);
          const result = await handleToolCall(event.name, args);
          console.log(`✅ Tool result: ${JSON.stringify(result).slice(0, 200)}`);

          // Send result back to OpenAI
          openaiWs.send(JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: event.call_id,
              output: JSON.stringify(result),
            },
          }));
          // Trigger response generation
          openaiWs.send(JSON.stringify({ type: "response.create" }));
        } catch (err) {
          console.error(`❌ Tool error: ${err.message}`);
          openaiWs.send(JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: event.call_id,
              output: JSON.stringify({ error: err.message }),
            },
          }));
          openaiWs.send(JSON.stringify({ type: "response.create" }));
        }
        break;

      // ── Transcription of user speech ────────────────────────────────────
      case "conversation.item.input_audio_transcription.completed":
        console.log(`🗣️  User: ${event.transcript}`);
        break;

      // ── Assistant response transcript ───────────────────────────────────
      case "response.audio_transcript.done":
        console.log(`🤖 Assistant: ${event.transcript}`);
        break;

      // ── Errors ──────────────────────────────────────────────────────────
      case "error":
        console.error("❌ OpenAI error:", event.error);
        break;
    }
  });

  openaiWs.on("error", (err) => {
    console.error("❌ OpenAI WebSocket error:", err.message);
  });

  openaiWs.on("close", (code, reason) => {
    console.log(`🤖 OpenAI connection closed (${code})`);
  });

  // ── Handle Twilio WebSocket messages ────────────────────────────────────────
  twilioWs.on("message", (message) => {
    const msg = JSON.parse(message.toString());

    switch (msg.event) {
      case "start":
        streamSid = msg.start.streamSid;
        callSid = msg.start.callSid;
        caller = msg.start.customParameters?.caller || "unknown";
        console.log(`📞 Stream started — SID: ${streamSid}, Caller: ${caller}`);
        break;

      case "media":
        // Forward audio from Twilio to OpenAI
        if (openaiWs?.readyState === WebSocket.OPEN) {
          openaiWs.send(JSON.stringify({
            type: "input_audio_buffer.append",
            audio: msg.media.payload,
          }));
        }
        break;

      case "stop":
        console.log("📞 Stream stopped");
        if (openaiWs?.readyState === WebSocket.OPEN) {
          openaiWs.close();
        }
        break;
    }
  });

  twilioWs.on("close", () => {
    console.log("📞 Twilio connection closed");
    if (openaiWs?.readyState === WebSocket.OPEN) {
      openaiWs.close();
    }
  });

  twilioWs.on("error", (err) => {
    console.error("❌ Twilio WebSocket error:", err.message);
  });
}
