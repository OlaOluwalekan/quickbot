import { z } from "zod";
import { route } from "@/server/http/route";
import { setAvatar, removeAvatar, getUserAvatar } from "@/server/services/avatar";

export const GET = route({
  auth: "required",
  handler: async (c) => {
    const result = await getUserAvatar(c.actor.userId);
    return result;
  },
});

export const PUT = route({
  auth: "required",
  body: z.object({
    attachmentId: z.string().min(1),
  }),
  handler: async (c) => {
    const result = await setAvatar(c.actor, c.body.attachmentId);
    return result;
  },
});

export const DELETE = route({
  auth: "required",
  handler: async (c) => {
    const result = await removeAvatar(c.actor);
    return result;
  },
});
