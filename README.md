# KLECX

![Klecx](/public/logo-light.png)

A modern, intelligent AI workspace built using Next.js 16, TypeScript, Tailwind CSS v4, NextAuth for authentication, Prisma ORM with PostgreSQL, Google GenAI (`@google/genai`) Interactions API for real-time SSE streaming & image generation, `next-intl` for internationalization, Resend for transactional emails, and Redux Toolkit for state management.

## Table of Contents

- [KLECX](#klecx)
  - [Table of Contents](#table-of-contents)
  - [Introduction](#introduction)
  - [Features](#features)
  - [Technologies](#technologies)
  - [App Themes](#app-themes)
  - [Installation](#installation)
    - [Prerequisites](#prerequisites)
    - [Steps](#steps)
  - [Usage](#usage)
  - [User Registration and Authentication](#user-registration-and-authentication)
  - [Chat Interface](#chat-interface)
  - [Contributing](#contributing)
  - [Contact](#contact)
  - [FAQs](#faqs)
  - [Acknowledgements](#acknowledgements)

## Introduction

Klecx is designed to provide real-time intelligent responses and native image generation using Google's Gemini Interactions API. It supports user authentication, multi-language internationalization (`next-intl`), Server-Sent Events (SSE) streaming, full-text chat search, mobile-ready REST API endpoints, and a sleek, responsive UI design.

Below is a diagram depicting the flow of the application:

![Flow Diagram](/public/archi-diagram.jpeg)

## Features

- Secure user authentication using [NextAuth](https://authjs.dev/) (Credentials, Google, GitHub + mobile Bearer token support)
- AI-powered conversational responses and native image generation using [Google Gemini Interactions API (`@google/genai`)](https://ai.google.dev/gemini-api/docs/interactions)
- Real-time token-by-token response streaming via **Server-Sent Events (SSE)**
- Internationalization (`en`, `fr`, `es`) powered by [`next-intl`](https://next-intl.dev/)
- Efficient state management with [Redux Toolkit](https://redux-toolkit.js.org/introduction/getting-started)
- Database management using [Prisma ORM](https://www.prisma.io/) and [PostgreSQL](https://www.postgresql.org/)
- Sleek, mobile-responsive UI with [Tailwind CSS v4](https://tailwindcss.com/)
- Built with [TypeScript](https://typescriptlang.org/) for type safety
- Transactional email notifications with [Resend](https://resend.com/)

## Technologies

- **Frontend:**
  - [**Next.js 16**](https://nextjs.org/): React framework for App Router, Server Components, and API Route Handlers
  - [**TypeScript**](https://typescriptlang.org/): JavaScript with static typing
  - [**Tailwind CSS v4**](https://tailwindcss.com/): Utility-first CSS framework
  - [**next-intl**](https://next-intl.dev/): Internationalization for Next.js

- **Backend & API:**
  - [**NextAuth (Auth.js v5)**](https://authjs.dev/): Authentication for web and mobile clients
  - [**Prisma ORM**](https://www.prisma.io/): Next-generation ORM for TypeScript and PostgreSQL
  - [**Google GenAI SDK (`@google/genai`)**](https://ai.google.dev/gemini-api/docs/interactions): Unified Interactions API for Gemini text, multi-turn chat, structured outputs, and image generation

- **Database:**
  - [**PostgreSQL**](https://www.postgresql.org/): Relational database for users, chats, responses, and token usage

- **State Management:**
  - [**Redux Toolkit**](https://redux-toolkit.js.org/introduction/getting-started): State management for React applications

- **Email:**
  - [**Resend**](https://resend.com/): Transactional email delivery

## App Themes

Klecx offers adaptive themes:

- **Light**: Crisp alabaster & slate palette with indigo-violet accents.
- **Dark**: Deep obsidian & zinc palette designed for low-light environments.

## Installation

### Prerequisites

Ensure that the following are installed:

- [Node.js](https://nodejs.org/en/) (v20.x or higher)
- [npm](https://www.npmjs.com/)
- [PostgreSQL](https://www.postgresql.org/) (or Docker via `docker-compose.yml`)

### Steps

1. **Clone the repository**

   ```bash
   git clone https://github.com/OlaOluwalekan/klecx.git
   cd klecx
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory (see `.env.example`):

   ```env
   DATABASE_URL="postgresql://postgres:password@localhost:5432/klecx_dev?schema=public"
   DOMAIN="http://localhost:3000"
   AUTH_SECRET="your-auth-secret"
   GITHUB_CLIENT_ID="your-github-client-id"
   GITHUB_CLIENT_SECRET="your-github-client-secret"
   GOOGLE_CLIENT_ID="your-google-client-id"
   GOOGLE_CLIENT_SECRET="your-google-client-secret"
   GEMINI_API_KEY="your-gemini-api-key"
   GEMINI_TEXT_MODEL="gemini-3.8-flash"
   GEMINI_IMAGE_MODEL="gemini-nano-banana-2.1"
   RESEND_API_KEY="re_your_resend_api_key"
   EMAIL_FROM="Klecx <onboarding@resend.dev>"
   ```

4. **Run database migration**
   ```bash
   npx prisma migrate dev
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Usage

## User Registration and Authentication

- **Sign Up**: New users can sign up using their email and password and verify their account via a Resend verification email.
- **Log In**: Registered users can log in using **credentials** (email and password) or **GitHub** / **Google** OAuth.
- **Secure Sessions**: User sessions are managed by NextAuth (with JWT support for mobile clients).

## Chat Interface

- **Chat**: Users can create a chat container which holds related questions, streaming AI responses, and generated images from Klecx. Chats are ordered from the most recent and automatically titled by Klecx. Users can rename or delete chats at any time.
- **Response & Streaming**: Responses stream in real time via Server-Sent Events (SSE) and are tokenized according to usage.
- **Image Generation**: Switch the composer to Image mode to generate high-resolution visuals directly inside any chat thread.
- **Markdown Rendering**: Text responses are rendered as rich Markdown with syntax-highlighted code blocks, copy actions, and text-to-speech playback.

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Clone your forked version of the repository:
   ```bash
   git clone https://github.com/your-username/klecx.git
   ```
3. Create a new branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
4. Add your contributions and commit your changes:
   ```bash
   git commit -m 'Add some feature'
   ```
5. Push to the branch:
   ```bash
   git push origin feature/your-feature-name
   ```
6. Open a pull request.

## Contact

For any inquiries or questions, please contact:

- Name: Olalekan Bello
- Email: olalekanbello534@gmail.com
- Twitter (or X): [x.com/OlaOluwalekanMi](https://x.com/OlaOluwalekanMi)
- Website: [bellsarena.com](https://bellsarena.com)

## FAQs

**What is the purpose of this project?**
Klecx aims to provide users with an intuitive, fast, and interactive AI chat and image generation experience powered by Google Gemini.

**How can I contribute to this project?**
You can contribute by forking the repository, creating a new branch for your feature or bug fix, and submitting a pull request (see [Contributing](#contributing)).

**How do I set up the project locally?**
Follow the [Installation](#installation) section to set up the project on your local machine.

**Who maintains this project?**
The project is maintained by Olalekan Bello. For any queries, you can reach out via [email](mailto:olalekanbello534@gmail.com) or [Twitter](https://x.com/OlaOluwalekanMi).

## Acknowledgements

Thanks to the contributors of Next.js, Tailwind CSS, Resend, `next-intl`, and Google Gemini API.
Special thanks to the open-source community for their invaluable resources and support.
