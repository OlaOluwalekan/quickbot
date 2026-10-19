# Klecx — Major Platform Upgrade Implementation Plan

## Goal Description

Transform the existing **QuickBot** project into **Klecx** — a modern, mobile-first, internationalized AI workspace powered by Google's latest **`@google/genai` Interactions API**, **Server-Sent Events (SSE)** real-time response streaming, **native AI image generation**, **Resend** transactional emails, and a **mobile-ready REST API architecture**.

This plan breaks down the 8 core workstreams into minute, sequential implementation steps:
1. **Global Rebrand to `Klecx` (`klecx`)** across all code, metadata, configs, database defaults, tests, and assets.
2. **Database Schema Evolution (Prisma)** to support Interactions API state chaining (`interactionId`), image generation responses (`type`, `imageUrl`, `mimeType`), and fix existing token-tracking bugs.
3. **Google `@google/genai` Interactions API Upgrade** replacing legacy `@google/generative-ai` with `ai.interactions.create` for text, multi-turn chat, structured JSON, SSE streaming, and `gemini-nano-banana-2.1` image generation.
4. **Resend Email Integration** replacing commented-out Nodemailer / Mailgun dependencies with the official `resend` SDK and a branded Klecx HTML verification email template.
5. **REST API Extraction for Mobile & Web Clients** migrating all logic from `utils/actions/*` into authenticated `app/api/*` Route Handlers supporting both NextAuth cookies (web) and Bearer JWTs (future mobile app).
6. **Server-Sent Events (SSE) Streaming** for real-time token-by-token AI response rendering in the chat UI and mobile API.
7. **Image Generation Functionality** allowing users to generate, view, and download AI images directly inside chats.
8. **Internationalization (`next-intl`) & Complete UI Rebrand** extracting all hardcoded strings into translation dictionaries and redesigning every page (`Landing`, `Auth`, `Chat Workspace`, `Settings`, `404`) with a sleek, responsive Tailwind CSS v4 design system.

---

## User Review Required

> [!IMPORTANT]
> **1. Internationalization (`next-intl`) Routing Strategy**
> To avoid breaking existing URLs (`/chat`, `/chat/[chatId]`, `/auth/login`, `/settings`) and OAuth redirect callbacks (`/api/auth/callback/*`), this plan configures `next-intl` in **cookie + `Accept-Language` header mode** (without forcing a `/[locale]/` URL prefix) and adds a sleek **Language Switcher** in the Header, Sidebar, and Settings page (shipping with English `en`, French `fr`, and Spanish `es` locales). If you prefer URL-prefixed locale routing (e.g., `/en/chat`, `/fr/chat`), let me know before we begin execution.

> [!IMPORTANT]
> **2. Image Storage Strategy**
> Google's `ai.interactions.create({ model: "gemini-nano-banana-2.1", input })` returns base64-encoded image bytes (`interaction.output_image.data` and `mime_type`). By default, we will store the generated image in PostgreSQL (`Response.imageUrl` as a data URI or served via an `/api/images/[responseId]` route with caching headers) so it works immediately with zero external S3/Cloudinary setup.

> [!WARNING]
> **3. Environment Variables Required**
> The following environment variables will be added/updated in `.env.example` and `.env`:
> - `RESEND_API_KEY="re_..."` (replaces `EMAIL_PASSWORD` and `EMAIL_SERVER`)
> - `EMAIL_FROM="Klecx <onboarding@resend.dev>"` (replaces `EMAIL_ADDRESS`)
> - `GEMINI_API_KEY="..."` (used by `@google/genai`)
> - `GEMINI_TEXT_MODEL="gemini-3.8-flash"` (configurable default text model)
> - `GEMINI_IMAGE_MODEL="gemini-nano-banana-2.1"` (configurable default image model)

---

## System Architecture Diagram

```mermaid
flowchart TD
    subgraph Clients["Clients (Web & Future Mobile App)"]
        WebUI["Next.js 16 Web UI\n(next-intl + Redux + Tailwind v4)"]
        MobileApp["Future Mobile App\n(Bearer JWT / REST + SSE)"]
    end

    subgraph APILayer["Next.js Route Handlers (app/api/*)"]
        AuthAPI["/api/auth/*\n(Login, Register, Verify, Resend, NextAuth)"]
        ChatAPI["/api/chats/*\n(CRUD, Responses, Search)"]
        StreamAPI["/api/chat/stream\n(SSE Real-Time Text Stream)"]
        ImageAPI["/api/chat/image\n(AI Image Generation)"]
        UserAPI["/api/user/*\n(Profile, Tokens, Usage)"]
        PromptsAPI["/api/prompts & /api/trends"]
    end

    subgraph Services["Core Services & Utilities"]
        GeminiInteractions["utils/ai-models/gemini.ts\n(@google/genai Interactions API)"]
        ResendService["utils/emails/*\n(Resend SDK)"]
        PrismaDB[("PostgreSQL + Prisma\n(User, Chat, Response, TokenUsage)")]
    end

    WebUI -->|Fetch / EventSource| APILayer
    MobileApp -->|HTTPS + Bearer Token| APILayer
    AuthAPI --> ResendService
    AuthAPI --> PrismaDB
    ChatAPI --> PrismaDB
    StreamAPI --> GeminiInteractions
    StreamAPI --> PrismaDB
    ImageAPI --> GeminiInteractions
    ImageAPI --> PrismaDB
    UserAPI --> PrismaDB
    PromptsAPI --> GeminiInteractions
```

---

## Proposed Changes

### Phase 1: Dependencies & Global Rebrand (`QuickBot` $\rightarrow$ `Klecx`)

Update package dependencies and replace all occurrences of `quickbot` / `QuickBot` / `Quick` with `klecx` / `Klecx`.

#### [MODIFY] [package.json](file:///c:/Users/olale/Documents/MyWorks/vscode/quickbot/package.json)
- **Step 1.1**: Rename `"name": "quickbot"` to `"name": "klecx"`.
- **Step 1.2**: Uninstall legacy `@google/generative-ai` and `mailgun.js`.
- **Step 1.3**: Install `@google/genai` (latest SDK with Interactions API), `resend`, and `next-intl`.

```diff
 {
-  "name": "quickbot",
+  "name": "klecx",
   "version": "0.1.0",
   "private": true,
   "dependencies": {
     "@auth/prisma-adapter": "^2.4.2",
-    "@google/generative-ai": "^0.16.0",
+    "@google/genai": "^2.3.0",
     "@prisma/adapter-pg": "^7.10.0",
     "@prisma/client": "^7.10.0",
...
-    "mailgun.js": "^10.2.3",
     "marked": "^14.0.0",
     "next": "^16.3.5",
     "next-auth": "^5.0.0-beta.25",
+    "next-intl": "^4.1.0",
     "numeral": "^2.0.6",
...
+    "resend": "^4.2.0",
```

#### [MODIFY] [docker-compose.yml](file:///c:/Users/olale/Documents/MyWorks/vscode/quickbot/docker-compose.yml)
- **Step 1.4**: Update `container_name` from `quickbot-postgres` to `klecx-postgres` and `POSTGRES_DB` from `quickbot_dev` to `klecx_dev`.

#### [MODIFY] [.env.example](file:///c:/Users/olale/Documents/MyWorks/vscode/quickbot/.env.example)
- **Step 1.5**: Replace legacy Gmail/Nodemailer variables and `quickbot` URLs with `klecx` and Resend configuration:
```dotenv
NEXT_PUBLIC_ENC_SECRET=87uNsYpAYMwBmzFrYmNlqJAmFZmkeTxITWAyFrkBvG8=
DATABASE_URL="postgresql://postgres:password@localhost:5432/klecx_dev?schema=public"
DOMAIN="http://localhost:3000"
AUTH_SECRET="OxzueOmyuHLPFdnmV9CNcn7Qy9USBL83xj/3TV95kSfQ"
GITHUB_CLIENT_ID="github-client-id"
GITHUB_CLIENT_SECRET="github-client-secret"
GOOGLE_CLIENT_ID="google-client-id"
GOOGLE_CLIENT_SECRET="google-client-secret"
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_TEXT_MODEL="gemini-3.8-flash"
GEMINI_IMAGE_MODEL="gemini-nano-banana-2.1"
RESEND_API_KEY="re_your_resend_api_key"
EMAIL_FROM="Klecx <onboarding@resend.dev>"
RAPIDAPI_KEY="your-rapidapi-key"
```

#### [MODIFY] [README.md](file:///c:/Users/olale/Documents/MyWorks/vscode/quickbot/README.md)
- **Step 1.6**: Rebrand all mentions of `QUICKBOT` / `Quickbot` to `KLECX` / `Klecx` and document the new architecture (Interactions API, SSE streaming, Image generation, Resend, `next-intl`, and REST API routes).

#### [MODIFY] [AppName.tsx](file:///c:/Users/olale/Documents/MyWorks/vscode/quickbot/components/logo/AppName.tsx) & [Logo.tsx](file:///c:/Users/olale/Documents/MyWorks/vscode/quickbot/components/logo/Logo.tsx)
- **Step 1.7**: Update `AppName.tsx` to render `Klecx` with a modern gradient/brand treatment (`bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 bg-clip-text text-transparent font-extrabold tracking-tight`).
- **Step 1.8**: Update `Logo.tsx` with a sleek vector/SVG Klecx mark alongside theme-aware fallback support so the logo is razor-sharp at every size (`icon`, `small`, `normal`, `medium`, `large`).

---

### Phase 2: Database Schema Evolution (Prisma)

Enhance the Prisma schema to support Interactions API conversation chaining (`interactionId`), multimodal image responses (`ResponseType`, `imageUrl`, `mimeType`), and fix the `TokenUsage` relation.

#### [MODIFY] [schema.prisma](file:///c:/Users/olale/Documents/MyWorks/vscode/quickbot/prisma/schema.prisma)
- **Step 2.1**: Add `ResponseType` enum (`TEXT`, `IMAGE`).
- **Step 2.2**: Add `type`, `imageUrl`, `mimeType`, and `interactionId` fields to `Response` model.
- **Step 2.3**: Run `npx prisma migrate dev --name klecx_interactions_and_images` (or `npx prisma db push` + `npx prisma generate`).

```prisma
enum ResponseType {
  TEXT
  IMAGE
}

model Response {
  id            String       @id @default(uuid())
  chatId        String
  question      String
  response      String
  type          ResponseType @default(TEXT)
  imageUrl      String?      @db.Text
  mimeType      String?
  interactionId String?
  createdAt     DateTime     @default(now())
  chat          Chat         @relation(fields: [chatId], references: [id], onDelete: Cascade)
}
```

#### [MODIFY] [chats.ts](file:///c:/Users/olale/Documents/MyWorks/vscode/quickbot/types/chats.ts)
- **Step 2.4**: Update `ResponseProps` and chat TypeScript interfaces to include `type?: 'TEXT' | 'IMAGE'`, `imageUrl?: string | null`, `mimeType?: string | null`, and `interactionId?: string | null`.

---

### Phase 3: Resend Email Module Replacement

Remove all Nodemailer/Mailgun code and implement transactional emails with `resend`.

#### [MODIFY] [send-email.ts](file:///c:/Users/olale/Documents/MyWorks/vscode/quickbot/utils/emails/send-email.ts)
- **Step 3.1**: Replace the commented-out Nodemailer implementation with the official `Resend` SDK:
```typescript
"use server";

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const sendMail = async (
  email: string,
  subject: string,
  message: string
): Promise<{ success: boolean; id?: string; error?: string }> => {
  try {
    const fromAddress = process.env.EMAIL_FROM || "Klecx <onboarding@resend.dev>";
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: [email],
      subject,
      html: message,
    });

    if (error) {
      console.error("Resend error:", error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (error: any) {
    console.error("Error sending email via Resend:", error);
    return { success: false, error: error?.message || "Failed to send email" };
  }
};

export default sendMail;
```

#### [MODIFY] [send-verification-email.ts](file:///c:/Users/olale/Documents/MyWorks/vscode/quickbot/utils/emails/send-verification-email.ts)
- **Step 3.2**: Update `sendVerificationEmail` to use a polished, responsive **Klecx** HTML email template with localized subject and CTA button, linking to `${process.env.DOMAIN}/auth/verify/verification?token=${token}`.

---

### Phase 4: Google `@google/genai` Interactions API Upgrade

Rewrite `utils/ai-models/gemini.ts` to use `@google/genai` and `ai.interactions.create` exclusively.

#### [MODIFY] [gemini.ts](file:///c:/Users/olale/Documents/MyWorks/vscode/quickbot/utils/ai-models/gemini.ts)
- **Step 4.1**: Initialize `const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });` and define default model constants:
  - `TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash"`
  - `IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-nano-banana-2.1"`
- **Step 4.2**: Implement `getGeminiResponse(prompt: string)` using `ai.interactions.create({ model: TEXT_MODEL, input: prompt })` and reading `interaction.output_text` + `interaction.usage?.total_tokens`.
- **Step 4.3**: Implement `getGeminiChatResponse(prompt: string, options?: { previousInteractionId?: string; history?: any[] })`:
  - If `previousInteractionId` is available from the last response in the chat, pass `previous_interaction_id: previousInteractionId` and `input: prompt` for native server-side state chaining.
  - Otherwise, if prior DB responses exist without an `interactionId`, format them as Interactions API stateless steps (`{ type: "user_input", content: [{ type: "text", text }] }`, `{ type: "model_output", content: [{ type: "text", text }] }`) and pass as `input`.
  - Return `{ text: interaction.output_text, interactionId: interaction.id, tokenCount: interaction.usage?.total_tokens ?? 100 }`.
- **Step 4.4**: Implement `streamGeminiChatInteraction(prompt: string, options?: { previousInteractionId?: string; history?: any[] })`:
  - Calls `await ai.interactions.create({ model: TEXT_MODEL, input, ...(previousInteractionId ? { previous_interaction_id: previousInteractionId } : {}), stream: true })`.
  - Returns the async iterable stream of SSE events (`step.delta` with `event.delta.type === "text"` and `interaction.completed` with `event.interaction.id` and `event.interaction.usage`).
- **Step 4.5**: Implement `getGeminiJSONResponse(prompt: string)` using `ai.interactions.create` with `response_format` JSON schema for template prompts:
```typescript
export const getGeminiJSONResponse = async (prompt: string) => {
  try {
    const interaction = await ai.interactions.create({
      model: TEXT_MODEL,
      input: prompt,
      response_format: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category: { type: "string" },
            prompt: { type: "string" },
          },
          required: ["category", "prompt"],
        },
      },
    });
    return ActionResponse.success("responded", {
      result: interaction.output_text,
    });
  } catch (error) {
    console.error(error);
    return ActionResponse.error("failed to respond", null);
  }
};
```
- **Step 4.6**: Implement `generateGeminiImage(prompt: string)` using `ai.interactions.create`:
```typescript
export const generateGeminiImage = async (prompt: string) => {
  try {
    const interaction = await ai.interactions.create({
      model: IMAGE_MODEL,
      input: prompt,
    });

    const generatedImage = interaction.output_image;
    if (!generatedImage || !generatedImage.data) {
      return ActionResponse.error("Failed to generate image", null);
    }

    const mimeType = generatedImage.mime_type || "image/png";
    const dataUrl = `data:${mimeType};base64,${generatedImage.data}`;
    const tokenCount = interaction.usage?.total_tokens ?? 500;

    return ActionResponse.success("Image generated", {
      imageUrl: dataUrl,
      mimeType,
      text: interaction.output_text || `Generated image for: "${prompt}"`,
      interactionId: interaction.id,
      tokenCount,
    });
  } catch (error) {
    console.error("Image generation error:", error);
    return ActionResponse.error("Failed to generate image", null);
  }
};
```

---

### Phase 5: Extract Server Actions to Mobile-Ready REST API Routes & SSE Streaming

To allow both the Next.js web app and a future mobile app to connect seamlessly, we will create a unified authentication helper (`utils/api-auth.ts`) that resolves the authenticated user from **either** a NextAuth session cookie (Web) **or** an `Authorization: Bearer <token>` JWT header (Mobile), and expose all server action capabilities as REST/SSE endpoints under `app/api/*`.

#### [NEW] [api-auth.ts](file:///c:/Users/olale/Documents/MyWorks/vscode/quickbot/utils/api-auth.ts)
- **Step 5.1**: Create `getAuthenticatedUser(req?: Request)` that:
  1. Checks `req?.headers.get("authorization")` for `Bearer <jwt>` and verifies it using `crypto-js` / `jose` with `AUTH_SECRET`.
  2. Falls back to `await auth()` from `@/auth` for cookie-based Next.js sessions.
  3. Queries `getUserById(userId)` to return the fresh user record (including current `tokens` balance).

#### [NEW] Auth API Endpoints (`app/api/auth/*`)
- **Step 5.2**: Create `[NEW] app/api/auth/login/route.ts` (`POST`):
  - Accepts JSON or FormData `{ email, password }`.
  - Runs the validation and credential checks from `utils/actions/login.ts`.
  - Calls `signIn("credentials", { email, password, redirect: false })` and also returns a signed mobile token + user payload in `ActionResponse.success`.
- **Step 5.3**: Create `[NEW] app/api/auth/register/route.ts` (`POST`):
  - Accepts `{ email, name, password, confirmPassword }`.
  - Creates the user, generates the verification token, and automatically dispatches the verification email via Resend (`sendVerificationEmail`).
- **Step 5.4**: Create `[NEW] app/api/auth/verify-email/route.ts` (`POST` & `GET`):
  - Accepts `{ token }` (or `?token=...`), verifies the token and expiry, updates `emailVerified`, and deletes the used token.
- **Step 5.5**: Create `[NEW] app/api/auth/resend-verification/route.ts` (`POST`):
  - Accepts `{ email }`, generates a fresh verification token, and sends the verification email via Resend.

#### [NEW] User & Token API Endpoints (`app/api/user/*`)
- **Step 5.6**: Create `[NEW] app/api/user/profile/route.ts` (`GET`, `PATCH`):
  - `GET`: Returns authenticated user profile (`id`, `name`, `email`, `image`, `tokens`, `role`).
  - `PATCH`: Updates user `name` (replacing direct client calls to `updateUserName`).
- **Step 5.7**: Create `[NEW] app/api/user/tokens/route.ts` (`GET`, `POST`):
  - `GET`: Returns `{ tokens: user.tokens, usageHistory }` via `getTokenUsageByUserId`.
  - `POST`: Allows requesting a token top-up when `user.tokens <= 0` (making the "Request Token" button on the Settings page functional!).

#### [NEW] Chat, Responses & Search API Endpoints (`app/api/chats/*`)
- **Step 5.8**: Create `[NEW] app/api/chats/route.ts` (`GET`, `POST`):
  - `GET`: Returns `{ chats, dates, grouped }` for the authenticated user (fixing the duplicate first-item bug in `getChats` reduce logic on line 70–73 of `utils/actions/chat.ts` where the first chat of each date was pushed twice!).
  - `POST`: Creates a new chat with AI-generated title for `{ prompt }`.
- **Step 5.9**: Create `[NEW] app/api/chats/[chatId]/route.ts` (`GET`, `PATCH`, `DELETE`):
  - `GET`: Returns `{ chat, responses }` after verifying chat ownership.
  - `PATCH`: Updates chat title (`updateChatTitle`).
  - `DELETE`: Deletes chat (`deleteChat`).
- **Step 5.10**: Create `[NEW] app/api/chats/search/route.ts` (`GET`):
  - Accepts `?q=...&option=this+chat|all+chats&chatId=...` and executes `searchChat`.

#### [NEW] SSE Streaming Chat Endpoint (`app/api/chat/stream/route.ts`)
- **Step 5.11**: Create `[NEW] app/api/chat/stream/route.ts` (`POST`):
  - Accepts JSON `{ prompt, chatId?, mode?: "text" | "image" }`.
  - Verifies authentication and checks `user.tokens > 0`.
  - Creates a `ReadableStream` with `TextEncoder` and returns a `Response` with headers:
    - `Content-Type: text/event-stream; charset=utf-8`
    - `Cache-Control: no-cache, no-transform`
    - `Connection: keep-alive`
  - **Stream lifecycle**:
    1. If `!chatId`, creates a new `Chat` with a generated title and sends SSE event:
       `event: chat_created\ndata: {"chatId": "...", "title": "..."}\n\n`
    2. Loads the last response in `chatId` to get `previousInteractionId` (or builds stateless `history` if none).
    3. Calls `streamGeminiChatInteraction(prompt, { previousInteractionId, history })`.
    4. Loops `for await (const chunk of stream)`:
       - When `chunk.event_type === "step.delta"` and `chunk.delta?.type === "text"`:
         - Appends `chunk.delta.text` to `fullText`.
         - Sends SSE event: `event: delta\ndata: {"text": "..."}\n\n`.
       - When `chunk.event_type === "interaction.completed"`:
         - Captures `interactionId = chunk.interaction?.id` and `tokenCount = chunk.interaction?.usage?.total_tokens`.
    5. Saves the `Response` in Prisma (`type: "TEXT"`, `interactionId`), records `TokenUsage` with `res.id` (fixing the bug where the whole object was passed), and updates `User.tokens = Math.max(0, user.tokens - tokenCount)`.
    6. Sends final SSE event:
       `event: done\ndata: {"response": {...}, "chatId": "...", "tokensUsed": ..., "remainingTokens": ...}\n\n`

#### [NEW] Image Generation API Endpoint (`app/api/chat/image/route.ts`)
- **Step 5.12**: Create `[NEW] app/api/chat/image/route.ts` (`POST`):
  - Accepts JSON `{ prompt, chatId? }`.
  - Verifies authentication and checks `user.tokens > 0`.
  - If `!chatId`, creates a new `Chat` titled after the image prompt.
  - Calls `generateGeminiImage(prompt)` (`utils/ai-models/gemini.ts`).
  - Creates a `Response` record in Prisma with `type: "IMAGE"`, `imageUrl: dataUrl`, `mimeType`, `interactionId`, and `response: text`.
  - Records `TokenUsage` (`res.id`) and deducts `tokenCount` from `User.tokens`.
  - Returns `ActionResponse.success("Image generated", { response: createdResponse, chatId, remainingTokens })`.

#### [NEW] Prompts & Trends API Endpoints
- **Step 5.13**: Create `[NEW] app/api/prompts/templates/route.ts` (`GET`) wrapping `getTemplatePrompts()`.
- **Step 5.14**: Create `[NEW] app/api/trends/route.ts` (`GET`) wrapping `getTrendingTopics()` from `utils/actions/location.ts` and reading `process.env.RAPIDAPI_KEY`.

---

### Phase 6: Internationalization (`next-intl`) Setup & String Extraction

Extract every user-facing string across the entire application into structured translation files.

#### [NEW] `i18n/config.ts` & `i18n/request.ts`
- **Step 6.1**: Create `i18n/config.ts` defining supported locales (`['en', 'fr', 'es']`), default locale (`'en'`), and locale labels.
- **Step 6.2**: Create `i18n/request.ts` using `getRequestConfig` from `next-intl/server` to read the `NEXT_LOCALE` cookie (or `Accept-Language` header fallback) and load `messages/${locale}.json`.
- **Step 6.3**: Update `next.config.mjs` with `createNextIntlPlugin('./i18n/request.ts')`.

#### [NEW] Translation Files (`messages/en.json`, `messages/fr.json`, `messages/es.json`)
- **Step 6.4**: Create `messages/en.json` (and corresponding `fr.json` and `es.json`) covering all extracted strings:
  - `Metadata`: `title` (`"Klecx | Your Intelligent AI Companion"`), `description`, `chatTitle` (`"New Chat | Ask Klecx anything"`).
  - `Common`: `appName` (`"Klecx"`), `loading`, `pleaseWait`, `cancel`, `save`, `delete`, `edit`, `copy`, `copied`, `download`, `tokens`, `backHome`, `errorOccurred`.
  - `Header`: `home`, `chat`, `account`, `login`, `signup`, `getStarted`.
  - `Hero`: `badge`, `typingTexts` (4 rotating headlines), `descriptionPrefix`, `descriptionSuffix`, `ctaPrimary` (`"Start Chatting"`), `ctaSecondary` (`"Explore Features"`), `bannerAlt`.
  - `Features`: `sectionTitle`, `sectionSubtitle`, `items` (`userFriendly`, `availability`, `personalized`, `imageGen`).
  - `Auth`:
    - `loginTitle`, `loginSubtitle`, `noAccount`, `registerHere`, `forgotPassword`, `loginButton`, `loggingIn`
    - `registerTitle`, `registerSubtitle`, `haveAccount`, `loginHere`, `registerButton`, `registering`
    - `emailPlaceholder`, `namePlaceholder`, `passwordPlaceholder`, `confirmPasswordPlaceholder`
    - `orContinueWith`, `registeredMessage`, `emailNotFoundRedirect`, `sendingEmail`, `resendIn`, `resendEmail`
    - `verifySuccess`, `verifyExpired`, `verifyInvalid`
    - `logout`
    - `validation`: all Zod and server validation messages.
  - `Chat`:
    - `newChat`, `askPlaceholder` (`"Ask Klecx anything..."`), `imagePlaceholder` (`"Describe the image you want Klecx to generate..."`)
    - `modeChat` (`"Chat"`), `modeImage` (`"Imagine"`)
    - `noChatYet` (`"No chats yet. Start a conversation or generate an image with Klecx."`)
    - `today`, `yesterday`, `you`, `aiName` (`"Klecx"`)
    - `searchPlaceholder`, `thisChat`, `allChats`, `noMatch`
    - `rename`, `delete`, `editChatTitle`, `chatTitlePlaceholder`, `updating`, `update`, `deleteConfirmTitle`, `deleteConfirmWarning`, `deleting`
    - `templatePrompts`: default localized starter prompts for Chat and Image Generation.
    - `generatingResponse`, `generatingImage`, `downloadImage`, `readAloud`, `stopReading`.
  - `Settings`:
    - `title`, `subtitle`, `profileSection`, `namePlaceholder`, `enterNameWarning`, `nameUpdated`, `nameUpdateFailed`
    - `tokensSection`, `tokensRemaining`, `requestToken`, `requestTokenTooltip`, `tokensRefilled`
    - `preferencesSection`, `themeLabel`, `languageLabel`, `goToChat`.
  - `NotFound`:
    - `title` (`"Page Not Found"`), `description` (`"The page you are looking for has been moved or does not exist."`), `backHome` (`"Back to Home"`).

#### [NEW] [LocaleSwitcher.tsx](file:///c:/Users/olale/Documents/MyWorks/vscode/quickbot/components/general/LocaleSwitcher.tsx)
- **Step 6.5**: Create a sleek dropdown/pill component that sets the `NEXT_LOCALE` cookie and calls `router.refresh()` to switch languages seamlessly without losing page state.

---

### Phase 7: State Management, SSE Client & Image Generation Integration

Update Redux state and chat components to handle real-time SSE streaming and image generation.

#### [MODIFY] [generalSlice.ts](file:///c:/Users/olale/Documents/MyWorks/vscode/quickbot/features/generalSlice.ts) & [general-state-types.ts](file:///c:/Users/olale/Documents/MyWorks/vscode/quickbot/types/general-state-types.ts)
- **Step 7.1**: Add state fields to `generalSlice`:
  - `chatMode: 'text' | 'image'` (toggles between text chat and image generation in `ChatInput`)
  - `streamingMessage: { question: string; response: string; type: 'TEXT' | 'IMAGE'; isStreaming: boolean } | null` (holds the optimistic user question and live-streaming AI markdown text or image shimmer before the final DB record is committed)
  - `userTokens: number | null` (tracks live token balance updates in the sidebar without requiring a full page reload)
- **Step 7.2**: Fix the bug in `utils/actions/chat.ts` where `getChats` pushed the first chat of a date group twice (`acc[date] = [chat]` followed immediately by `acc[date].push(chat)`).

#### [MODIFY] [ChatInput.tsx](file:///c:/Users/olale/Documents/MyWorks/vscode/quickbot/components/chats/ChatInput.tsx)
- **Step 7.3**: Add a mode switcher pill inside the composer bar: **Chat (`text`)** vs **Image (`image`)** (also auto-detecting `/image ` or `/imagine ` prefixes).
- **Step 7.4**: Implement SSE streaming consumption in `handleSubmit`:
  - When `chatMode === 'text'`:
    1. Dispatches `setStreamingMessage({ question: prompt, response: '', type: 'TEXT', isStreaming: true })` and clears the input immediately.
    2. Sends a `POST` request via `fetch('/api/chat/stream', { method: 'POST', body: JSON.stringify({ prompt, chatId }) })`.
    3. Reads `response.body.getReader()` with `TextDecoder`, parsing SSE frames (`event: chat_created`, `event: delta`, `event: done`, `event: error`):
       - On `delta`: appends `data.text` to `streamingMessage.response` in Redux so the user sees tokens appear live in real time.
       - On `chat_created`: stores the newly created `chatId`.
       - On `done`: updates `userTokens`, clears `streamingMessage`, and navigates/refreshes the chat view (`router.push` or local state append).
  - When `chatMode === 'image'`:
    1. Dispatches `setStreamingMessage({ question: prompt, response: '', type: 'IMAGE', isStreaming: true })`.
    2. Calls `POST /api/chat/image` with `{ prompt, chatId }`.
    3. On completion, updates `userTokens`, clears `streamingMessage`, and renders the new image response.
- **Step 7.5**: Add `Enter` to submit (and `Shift+Enter` for newline) support for desktop usability.

#### [MODIFY] [ResponseList.tsx](file:///c:/Users/olale/Documents/MyWorks/vscode/quickbot/components/chats/ResponseList.tsx) & [Response.tsx](file:///c:/Users/olale/Documents/MyWorks/vscode/quickbot/components/chats/Response.tsx)
- **Step 7.6**: Update `ResponseList.tsx` to maintain local `responses` state synced with server `data` plus the active `streamingMessage` from Redux, smoothly auto-scrolling as chunks stream in.
- **Step 7.7**: Update `Response.tsx` to:
  - Replace `"Quickbot"` with localized `"Klecx"` (`t('aiName')`).
  - Render a pulsing streaming cursor when `isStreaming` is active.
  - When `response.type === 'IMAGE'` and `response.imageUrl` is present, render a high-resolution image card with:
    - Rounded container, hover overlay with **Download Image** and **View Fullscreen (Lightbox)** buttons, and caption text.
  - When `isStreaming && type === 'IMAGE'`, render an animated gradient shimmer placeholder with `"Generating image with Klecx..."`.

---

### Phase 8: Complete UI Rebrand & Mobile Responsiveness Overhaul

Redesign all pages and components using a cohesive, modern Tailwind CSS v4 design system with full mobile responsiveness.

#### [MODIFY] [globals.css](file:///c:/Users/olale/Documents/MyWorks/vscode/quickbot/app/globals.css) & [style.css](file:///c:/Users/olale/Documents/MyWorks/vscode/quickbot/app/style.css)
- **Step 8.1**: Overhaul `@theme` tokens in `app/globals.css`:
  - **Light Theme**: Crisp slate background (`#f8fafc`), pure white elevated cards (`#ffffff`), deep slate typography (`#0f172a`), indigo-violet primary (`#4f46e5`), cyan secondary (`#06b6d4`), subtle borders (`#e2e8f0`).
  - **Dark Theme**: Obsidian background (`#09090b`), elevated zinc surfaces (`#121215` / `#18181b`), crisp off-white text (`#f4f4f5`), vibrant indigo-violet primary (`#6366f1`), cyan accent (`#22d3ee`), subtle borders (`#27272a`).
- **Step 8.2**: Clean up `app/style.css` (removing the leftover `background: green` and `rebeccapurple` scrollbar test rules) and add smooth custom scrollbars and glassmorphism utility styles.

#### [MODIFY] Landing Page (`app/page.tsx`, `Header.tsx`, `Hero.tsx`, `Features.tsx`, `Feature.tsx`)
- **Step 8.3**: Redesign `Header.tsx`:
  - Sticky glassmorphic top bar (`backdrop-blur-md bg-base-100/80 dark:bg-dark-base-100/80 border-b`).
  - Desktop nav links + `<LocaleSwitcher />` + theme toggle + Login/Signup CTAs.
  - Responsive mobile menu drawer so mobile users can access Login, Signup, Language Switcher, and navigation links effortlessly.
- **Step 8.4**: Redesign `Hero.tsx`:
  - Ambient gradient mesh background glow, pill badge (`"✨ Powered by Gemini Interactions & Image AI"`), animated typewriter headline, localized description with `<AppName />`, dual CTA buttons (`Start Chatting` + `Generate Images`), and a sleek framed preview showcase.
- **Step 8.5**: Redesign `Features.tsx` & `Feature.tsx`:
  - 4-card responsive bento grid highlighting: (1) Real-Time Streaming Chat, (2) Native AI Image Generation, (3) 24/7 Stateful Context, and (4) Multi-Language Experience.

#### [MODIFY] Auth Pages (`AuthWrapper.tsx`, `AuthCard.tsx`, `LoginForm.tsx`, `RegisterForm.tsx`, `Registered.tsx`, `VerificationForm.tsx`)
- **Step 8.6**: Redesign `AuthWrapper.tsx` and `AuthCard.tsx`:
  - Modern gradient + subtle grid backdrop, centered glassmorphic card (`max-w-md w-[92%] mx-auto rounded-2xl shadow-2xl border p-6 sm:p-8`), proper flex divider for `"Or continue with"`, and separate `backLinkHref` vs `backLinkLabel` props so translated labels never break route URLs.
- **Step 8.7**: Update `LoginForm.tsx`, `RegisterForm.tsx`, `Registered.tsx`, and `VerificationForm.tsx` to use the new `/api/auth/*` endpoints, localized `next-intl` strings, and polished input focus rings (`InputWithIcon.tsx`) and buttons (`BasicButton.tsx` — fixing the missing `disabled` and `onClick` pass-through props on `<button>`!).

#### [MODIFY] Chat Workspace (`app/chat/template.tsx`, `Sidebar.tsx`, `ChatMobileHeader.tsx`, `ChatDesktopHeader.tsx`, `ChatList.tsx`, `ChatMenu.tsx`, `Search.tsx`, `TemplatePrompts.tsx`, `EditPopup.tsx`, `DeletePopup.tsx`, `UserProfile.tsx`, `ProfileDialog.tsx`)
- **Step 8.8**: Refactor `app/chat/template.tsx`:
  - Use `h-dvh w-screen overflow-hidden flex flex-col md:flex-row bg-base-100 dark:bg-dark-base-100` instead of fragile `calc(100vh - 125px)` pixel offsets.
- **Step 8.9**: Refactor `Sidebar.tsx` & `ChatList.tsx`:
  - Fix the mobile drawer bug (`small:w-full` was making the sidebar cover 100% width on screens $\ge 400\text{px}$, blocking backdrop clicks). Use a `w-72 max-w-[82vw]` slide-over drawer with a blurred backdrop overlay on `< md` and a docked `w-72 border-r` panel on `md+`.
  - Add a prominent `"New Chat"` button, clean date section headers, hover/active states on chat items, and a bottom profile bar showing live token balance (`userTokens ?? data.token`) and `<LocaleSwitcher />`.
- **Step 8.10**: Refactor `ChatMenu.tsx`, `EditPopup.tsx`, and `DeletePopup.tsx`:
  - Replace removed DaisyUI `menu` classes with clean Tailwind v4 popover and modal cards.
  - Connect `EditPopup` and `DeletePopup` to `PATCH /api/chats/[chatId]` and `DELETE /api/chats/[chatId]`.
- **Step 8.11**: Refactor `Search.tsx` and `SearchResult.tsx`:
  - Make the search input and scope selector responsive on mobile and desktop headers, calling `GET /api/chats/search`.
- **Step 8.12**: Refactor `TemplatePrompts.tsx`:
  - Display a welcoming empty-state greeting on `/chat` with 4 responsive starter cards (including both text prompts and an image generation prompt) that trigger SSE streaming or image generation directly.

#### [MODIFY] Settings & 404 Pages (`app/settings/page.tsx`, `SettingsCard.tsx`, `NameAndEmail.tsx`, `TokensDisplay.tsx`, `UserProfileImage.tsx`, `NotFound.tsx`)
- **Step 8.13**: Redesign `/settings` into a modern responsive account panel with:
  - Profile avatar + inline name editing (via `PATCH /api/user/profile`),
  - Token balance progress bar + working `"Request Token"` button (via `POST /api/user/tokens`),
  - Preferences section with **Theme Switcher** and **Language Switcher (`<LocaleSwitcher />`)**,
  - Navigation back to `/chat` and Logout button.
- **Step 8.14**: Redesign `NotFound.tsx` and `app/not-found.tsx` with proper dark mode support and localized text.

---

### Phase 9: Unit & Integration Tests Update

Update all test suites under `__tests__/` to reflect the **Klecx** rebrand, `next-intl` provider context, and new composer UI.

#### [MODIFY] [Home.test.tsx](file:///c:/Users/olale/Documents/MyWorks/vscode/quickbot/__tests__/Home.test.tsx), [ChatInput.test.tsx](file:///c:/Users/olale/Documents/MyWorks/vscode/quickbot/__tests__/ChatInput.test.tsx), & [Chat.test.tsx](file:///c:/Users/olale/Documents/MyWorks/vscode/quickbot/__tests__/Chat.test.tsx)
- **Step 9.1**: Wrap rendered components in `NextIntlClientProvider` with `messages/en.json` in test helpers.
- **Step 9.2**: Update assertions from `/QuickBot/i` and `/Ask Quick/i` to `/Klecx/i` and `/Ask Klecx/i`.
- **Step 9.3**: Add test coverage for switching between Chat and Image Generation modes in `ChatInput`.

---

## Verification Plan

### Automated Tests
1. **Prisma Schema & Type Check**:
   ```powershell
   npx prisma generate
   npx tsc --noEmit
   ```
2. **Unit & Component Tests (Jest + React Testing Library)**:
   ```powershell
   npm test -- --watchAll=false
   ```
3. **Production Build Verification**:
   ```powershell
   npm run build
   ```

### Manual Verification
1. **Rebrand & Internationalization (`next-intl`)**:
   - Visit `/`, `/auth/login`, `/auth/register`, `/chat`, and `/settings`. Verify `"Klecx"` appears everywhere with zero references to `"QuickBot"` or `"Quick"`.
   - Use the Language Switcher to toggle between English (`en`), French (`fr`), and Spanish (`es`) and verify all UI text updates immediately.
2. **Resend Email Flow**:
   - Register a new user or click "Resend Email" on `/auth/registered` and verify `resend.emails.send` dispatches the branded Klecx verification email.
3. **SSE Streaming Chat (Gemini Interactions API)**:
   - Send a prompt in `/chat` and verify:
     - A new chat is created with an AI-generated title,
     - The AI response streams token-by-token via `/api/chat/stream` using `ai.interactions.create({ stream: true })`,
     - Subsequent messages in `/chat/[chatId]` maintain multi-turn conversation context via `previous_interaction_id`,
     - User token count decrements accurately and logs to `TokenUsage`.
4. **Image Generation**:
   - Toggle the composer to **Imagine (Image)** mode in `/chat`, enter a prompt (e.g., *"A futuristic neon-lit studio with the word Klecx"*), and verify the shimmer state, generated image rendering, lightbox preview, and image download work end-to-end.
5. **Mobile Responsiveness**:
   - Test at `375px` (iPhone SE/Mini), `768px` (iPad), and `1440px` (Desktop) viewports to verify the mobile header, slide-over sidebar drawer, responsive prompt cards, and settings layout.
