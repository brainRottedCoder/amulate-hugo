# Hugo AI Architecture - Interview Explanation Script

## Duration: 5-7 minutes

---

## Opening (30 seconds)

"Let me walk you through the architecture of **Hugo AI**, the core innovation of Voltway ERP. Hugo is not just a chatbot—it's an intelligent agent that can understand natural language, query operational data, execute database operations, and automate supplier communications. I'll explain the complete request-response pipeline using this diagram."

---

## Stage 1: User Input (30 seconds)

*[Point to UserInput section]*

"The flow starts when a user interacts with Hugo. There are two types of inputs:

1. **Natural Language Query** - Like 'What parts are running low?' or 'Update stock for P305 to 200 units'
2. **File Attachment** - Users can upload PDFs like invoices or images of warehouse receipts

The key here is that users don't need to learn any commands or navigate complex menus. They just type what they want in plain English."

---

## Stage 2: Frontend Processing (45 seconds)

*[Point to ChatUI section]*

"The Hugo Chat UI handles four critical tasks before sending anything to the server:

**First, Input Handling** - We capture the user's message and sanitize it for security.

**Second, File Processing** - If there's a PDF or image, we convert it to Base64. This is important because we need to send binary data over HTTP.

**Third, Conversation History** - We maintain the last 6 messages for context. This allows Hugo to understand follow-up questions like 'Send emails to all of them' after showing critical parts.

**Fourth, Database Context Building** - This is where it gets interesting. We DON'T send the entire database to the LLM. Instead, we build a compressed context:
- Aggregate counts: 450 healthy, 42 low, 8 critical
- Only essential fields: part_id, name, stock, status
- Last 20 orders, not full history

This context optimization is crucial for managing LLM costs and staying within token limits."

---

## Stage 3: API Route Processing (1 minute)

*[Point to APIRoute section]*

"Now we hit the server-side `/api/hugo` route. Four things happen here:

**Request Parsing** - We extract the message, file, and context from the request body.

**PDF Extraction** - If a file was uploaded, we use `pdf-parse` library to extract text. The magic happens here—we convert a binary PDF into searchable text that the LLM can understand.

```javascript
const pdfData = await pdfParse(buffer);
const text = pdfData.text.substring(0, 8000);
```

We truncate to 8,000 characters because larger documents would exceed our context budget.

**Context Injection** - We pull the latest data from Firestore to ensure Hugo has real-time information. Stock levels change constantly in manufacturing—Hugo needs current data.

**Prompt Building** - This is where we construct the system prompt. It includes:
- Hugo's role definition
- Available actions (add, update, delete, send_email)
- Business rules and constraints
- The actual database context as JSON"

---

## Stage 4: LLM Processing (1.5 minutes)

*[Point to LLMProcessing section]*

"This is the brain of Hugo. We're using **LangChain** as the orchestration layer and **MegaLLM** as the language model—it's a 120 billion parameter model, OpenAI-compatible.

**System Prompt** - Contains ERP-specific instructions. For example:
```
You are Hugo, an ERP assistant for electric scooter manufacturing.
When user requests a database update, return a JSON action block.
Never invent part_ids. Only use IDs from the provided context.
```

**Conversation Memory** - LangChain maintains the chat history so Hugo can resolve pronouns. When user says 'Send reorder emails for all of them,' Hugo knows 'them' refers to the critical parts from the previous response.

**Action Parsing** - Here's the key insight: We structured the prompts so the LLM returns a specific JSON format when an action is needed:

```json
{
  'response': 'I will update the stock for P305 to 200 units.',
  'action': {
    'type': 'update_stock',
    'collection': 'stock_levels',
    'searchField': 'part_id',
    'searchValue': 'P305',
    'data': { 'quantity_available': 200 }
  }
}
```

This structured output is what makes Hugo actually useful—it's not just generating text, it's generating executable operations."

---

## Stage 5: Response Handling (30 seconds)

*[Point to ResponseHandler section]*

"The API processes the LLM response and extracts three components:

1. **Text Response** - The natural language answer to show the user
2. **Action Object** - If any database operation was requested
3. **Email Trigger** - If supplier communication was requested

These are sent back to the frontend as a structured JSON response."

---

## Stage 6: Action Execution (1 minute)

*[Point to ActionExecution section]*

"This is where safety becomes critical. We NEVER auto-execute database operations. Here's the flow:

**Confirmation Dialog** - The user sees exactly what Hugo wants to do:
'Update stock for P305 from 45 to 200 units. Confirm?'

**User Confirms** - Only then do we hit `/api/hugo/actions`

**Server-side Validation** - Before touching the database, we validate:
- Does this part_id actually exist?
- Is the collection allowed? (whitelist: materials, stock_levels, orders)
- Are the data types correct?

**Firebase Admin SDK** - We use elevated privileges to execute the operation:
```javascript
await admin.firestore()
  .collection('stock_levels')
  .where('part_id', '==', 'P305')
  .get()
  .then(snapshot => snapshot.docs[0].ref.update({ quantity_available: 200 }));
```

This two-step confirmation prevents LLM hallucinations from corrupting production data."

---

## Stage 7: Real-time Updates (30 seconds)

*[Point to Output section]*

"Finally, the magic of real-time sync:

The moment Firestore updates, all connected clients receive the change through WebSocket listeners. React state updates automatically through our custom `onSnapshot` hooks.

So if I update stock on my machine, my colleague's dashboard reflects it within 100 milliseconds. No refresh needed."

---

## Closing Summary (30 seconds)

"To summarize the Hugo AI pipeline:

1. **User types natural language** → No training required
2. **Frontend optimizes context** → Cost-efficient LLM usage
3. **LLM generates structured actions** → Not just text, executable operations
4. **Confirmation before execution** → Safety against hallucinations
5. **Real-time sync** → Instant updates across all users

This architecture makes Hugo production-ready—it's not a prototype chatbot, it's a genuine automation engine that can handle manufacturing operations."

---

## Prepared for Follow-up Questions

### "How do you handle LLM failures?"

"We implement timeout handling and fallback responses. If MegaLLM is down, Hugo displays: 'I'm having connection issues. Here are manual shortcuts to the inventory and procurement pages.' The app remains functional for all non-AI features."

### "What about prompt injection attacks?"

"Three layers of defense: Input sanitization before sending to LLM, strict action whitelisting on the server, and Firestore security rules as the last line of defense. An attacker saying 'delete everything' would fail because delete operations require confirmation AND server validation of permissions."

### "How do you manage costs?"

"Context compression is key. We send aggregate counts, not raw data. We cache common queries. And we use token limits in the system prompt to prevent verbose responses. At scale, we'd implement a tiered model—smaller LLM for simple lookups, large model only for complex reasoning."

### "What's the latency?"

"Typically 2-3 seconds for a complete response. Breakdown: 200ms for context building, 1.5-2 seconds for LLM processing, 100ms for action parsing. We're planning to add streaming responses to show tokens as they generate, improving perceived performance."

---

## Key Technical Terms to Use

| Term | When to Use |
|------|-------------|
| **LangChain** | "We use LangChain for agent orchestration" |
| **Prompt Engineering** | "The system prompt was carefully engineered with examples" |
| **RAG** | "For larger datasets, we'd implement RAG—Retrieval Augmented Generation" |
| **Context Window** | "We optimize for the LLM's context window" |
| **Structured Output** | "The LLM returns structured JSON, not just text" |
| **Two-step Confirmation** | "Critical for preventing hallucination-induced errors" |
| **Real-time Listeners** | "Firestore's onSnapshot provides WebSocket-based updates" |

---

## Diagram Walkthrough Tips

1. **Start from top-left** - Follow the natural flow
2. **Pause at each stage** - Give interviewer time to absorb
3. **Point at specific boxes** - Don't just wave vaguely
4. **Use color coding** - "Purple boxes are AI components, green are API routes"
5. **Relate to real examples** - "When I say 'show critical parts', this is where..."

---

*Practice this script 2-3 times before the interview. Time yourself to ensure you're within 5-7 minutes.*
