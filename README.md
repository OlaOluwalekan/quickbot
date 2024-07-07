# QUICKBOT

A comprehensive chatbot application built using Next.js, TypeScript, Tailwind CSS, Next-Auth for authentication, Prisma ORM, MongoDB, Google Generative AI API for AI responses, and Redux Toolkit for state management.

## Table of Contents

1. [Introduction](#introduction)
1. [Features](#features)
1. [Technologies](#technologies)
1. [Themes](#app-themes)

## Introduction

This chatbot app is designed to provide intelligent responses to user queries using Google's Generative AI API. It supports user authentication, state management, and a sleek UI design.

## Features

- User authentication using [NextAuth](https://authjs.dev/)
- AI powered response using [Google Gemini API](https://ai.google.dev/gemini-api/docs)
- State management with [Redux Toolkit](https://redux-toolkit.js.org/introduction/getting-started)
- Database management using [Prisma ORM](https://www.prisma.io/) and [MongoDB](https://www.mongodb.com/)
- Responsive UI with [Tailwind CSS](https://tailwindcss.com/) and [Daisy UI components](https://daisyui.com/)
- Built with [TypeScript](https://typescriptlang.org/) for type safety

## Technologies

- [**Next.js**](https://nextjs.org/): React framework for server-side rendering and static site generation
- [**TypeScript**](https://typescriptlang.org/): JavaScript with static typing
- [**Tailwind CSS**](https://tailwindcss.com/): Utility-first CSS framework
- [**Daisy UI**](https://daisyui.com/): Popular component library for Tailwind CSS
- [**NextAuth (or Auth.js)**](https://authjs.dev/): Free and open source authentication for the web
- [**Prisma ORM**](https://www.prisma.io/): Next-generation ORM for TypeScript and JavaScript
- [**MongoDB**](https://www.mongodb.com/): NoSQL database for storing data
- [**Google Gemini**](https://ai.google.dev/gemini-api/docs): API for generating AI responses
- [**Redux Toolkit**](https://redux-toolkit.js.org/introduction/getting-started): State management for React applications

## App Themes

The app contains for themes - [Light](#light) (the main theme), [Cupcake](#cupcake) (a variant of light), [Black](#black) (the dark theme) and [Dracula](#dracula) (a variant of the dark theme)

### Light

<div style="display: flex; gap: 10px">
    <div class="theme-color" style="display: flex; flex-direction: column; justify-content: center; align-items: center; width: 80px" >
        <article style="width: 30px; aspect-ratio: 1; background-color: #5b16fc; border: 1px solid white; cursor: pointer"></article>
        <span>primary</span>
    </div>
    <div class="theme-color" style="display: flex; flex-direction: column; justify-content: center; align-items: center; width: 80px" >
        <article style="width: 30px; aspect-ratio: 1; background-color: #10c4e3; border: 1px solid white; cursor: pointer"></article>
        <span>secondary</span>
    </div>
    <div class="theme-color" style="display: flex; flex-direction: column; justify-content: center; align-items: center; width: 80px" >
        <article style="width: 30px; aspect-ratio: 1; background-color: #f3f5fd; border: 1px solid white; cursor: pointer"></article>
        <span>base-100</span>
    </div>
    <div class="theme-color" style="display: flex; flex-direction: column; justify-content: center; align-items: center; width: 80px" >
        <article style="width: 30px; aspect-ratio: 1; background-color: #0f7eba; border: 1px solid white; cursor: pointer"></article>
        <span>neutral</span>
    </div>
    <div class="theme-color" style="display: flex; flex-direction: column; justify-content: center; align-items: center; width: 80px" >
        <article style="width: 30px; aspect-ratio: 1; background-color: #32049c; border: 1px solid white; cursor: pointer"></article>
        <span>accent</span>
    </div>
</div>

### Cupcake

<div style="display: flex; gap: 10px">
    <div class="theme-color" style="display: flex; flex-direction: column; justify-content: center; align-items: center; width: 80px" >
        <article style="width: 30px; aspect-ratio: 1; background-color: #9500af; border: 1px solid white; cursor: pointer"></article>
        <span>primary</span>
    </div>
    <div class="theme-color" style="display: flex; flex-direction: column; justify-content: center; align-items: center; width: 80px" >
        <article style="width: 30px; aspect-ratio: 1; background-color: #db34f8; border: 1px solid white; cursor: pointer"></article>
        <span>secondary</span>
    </div>
    <div class="theme-color" style="display: flex; flex-direction: column; justify-content: center; align-items: center; width: 80px" >
        <article style="width: 30px; aspect-ratio: 1; background-color: #fcf5d2; border: 1px solid white; cursor: pointer"></article>
        <span>base-100</span>
    </div>
    <div class="theme-color" style="display: flex; flex-direction: column; justify-content: center; align-items: center; width: 80px" >
        <article style="width: 30px; aspect-ratio: 1; background-color: #e511ad; border: 1px solid white; cursor: pointer"></article>
        <span>neutral</span>
    </div>
    <div class="theme-color" style="display: flex; flex-direction: column; justify-content: center; align-items: center; width: 80px" >
        <article style="width: 30px; aspect-ratio: 1; background-color: #550663; border: 1px solid white; cursor: pointer"></article>
        <span>accent</span>
    </div>
</div>

### Black

<div style="display: flex; gap: 10px">
    <div class="theme-color" style="display: flex; flex-direction: column; justify-content: center; align-items: center; width: 80px" >
        <article style="width: 30px; aspect-ratio: 1; background-color: #2d2d31; border: 1px solid white; cursor: pointer"></article>
        <span>primary</span>
    </div>
    <div class="theme-color" style="display: flex; flex-direction: column; justify-content: center; align-items: center; width: 80px" >
        <article style="width: 30px; aspect-ratio: 1; background-color: #1a1a1d; border: 1px solid white; cursor: pointer"></article>
        <span>secondary</span>
    </div>
    <div class="theme-color" style="display: flex; flex-direction: column; justify-content: center; align-items: center; width: 80px" >
        <article style="width: 30px; aspect-ratio: 1; background-color: #000000; border: 1px solid white; cursor: pointer"></article>
        <span>base-100</span>
    </div>
    <div class="theme-color" style="display: flex; flex-direction: column; justify-content: center; align-items: center; width: 80px" >
        <article style="width: 30px; aspect-ratio: 1; background-color: #392c40; border: 1px solid white; cursor: pointer"></article>
        <span>neutral</span>
    </div>
    <div class="theme-color" style="display: flex; flex-direction: column; justify-content: center; align-items: center; width: 80px" >
        <article style="width: 30px; aspect-ratio: 1; background-color: #40404c; border: 1px solid white; cursor: pointer"></article>
        <span>accent</span>
    </div>
</div>

### Dracula

<div style="display: flex; gap: 10px">
    <div class="theme-color" style="display: flex; flex-direction: column; justify-content: center; align-items: center; width: 80px" >
        <article style="width: 30px; aspect-ratio: 1; background-color: #090118; border: 1px solid white; cursor: pointer"></article>
        <span>primary</span>
    </div>
    <div class="theme-color" style="display: flex; flex-direction: column; justify-content: center; align-items: center; width: 80px" >
        <article style="width: 30px; aspect-ratio: 1; background-color: #23163d; border: 1px solid white; cursor: pointer"></article>
        <span>secondary</span>
    </div>
    <div class="theme-color" style="display: flex; flex-direction: column; justify-content: center; align-items: center; width: 80px" >
        <article style="width: 30px; aspect-ratio: 1; background-color: #060031; border: 1px solid white; cursor: pointer"></article>
        <span>base-100</span>
    </div>
    <div class="theme-color" style="display: flex; flex-direction: column; justify-content: center; align-items: center; width: 80px" >
        <article style="width: 30px; aspect-ratio: 1; background-color: #461a58; border: 1px solid white; cursor: pointer"></article>
        <span>neutral</span>
    </div>
    <div class="theme-color" style="display: flex; flex-direction: column; justify-content: center; align-items: center; width: 80px" >
        <article style="width: 30px; aspect-ratio: 1; background-color: #1e0649; border: 1px solid white; cursor: pointer"></article>
        <span>accent</span>
    </div>
</div>
