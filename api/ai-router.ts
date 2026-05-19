import { z } from "zod";
import { askAI } from "./services/ai-service";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { aiConversations, aiMessages } from "@db/schema";
import { eq, desc, and } from "drizzle-orm";




export const aiRouter = createRouter({
  conversations: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    console.log("[AI role]", ctx.user?.role);
    console.log("[AI tenant]", ctx.user?.tenantId);
    const result = await db.query.aiConversations.findMany({
      where:
        ctx.user?.role === "super_admin"
          ? undefined
          : eq(aiConversations.tenantId, ctx.user!.tenantId as number),
      orderBy: [desc(aiConversations.updatedAt)],
      with: { messages: true },
    });
    console.log("[AI conversations result]", result);
    return result;
  }),

  conversation: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      console.log("[AI role]", ctx.user?.role);
      console.log("[AI tenant]", ctx.user?.tenantId);
      const whereCond =
        ctx.user?.role === "super_admin"
          ? eq(aiConversations.id, input.id)
          : and(eq(aiConversations.id, input.id), eq(aiConversations.tenantId, ctx.user!.tenantId as number));
      const result = await db.query.aiConversations.findFirst({
        where: whereCond,
        with: { messages: { orderBy: [desc(aiMessages.createdAt)] } },
      });
      console.log("[AI conversation result]", result);
      return result;
    }),

  createConversation: authedQuery
    .input(z.object({
      title: z.string().min(1),
      model: z.string().default("gpt-4"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const result = await db.insert(aiConversations).values({
        tenantId: ctx.user!.tenantId as number,
        userId: ctx.user!.id,
        title: input.title,
        model: input.model,
        status: "active",
      });
      return { id: Number(result[0].insertId) };
    }),

  sendMessage: authedQuery
    .input(z.object({
      conversationId: z.number(),
      content: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();

      const conversation = await db.query.aiConversations.findFirst({
        where: and(eq(aiConversations.id, input.conversationId), eq(aiConversations.tenantId, ctx.user!.tenantId as number)),
      });
      if (!conversation) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      }

      // Store user message
      await db.insert(aiMessages).values({
        conversationId: input.conversationId,
        role: "user",
        content: input.content,
        tokensUsed: input.content.split(" ").length,
      });

      // Simulate AI response
      const result = await askAI([
  {
    role: "system",
    content: `You are PSB ERP AI assistant.

Help users with:
tickets
customers
finance
wallets
travel workflow
reports
analytics`
  },

  {
    role: "user",
    content: input.content
  }
]);

const responseText =
  result?.choices?.[0]
    ?.message?.content
  ||
  "No response generated";

      await db.insert(aiMessages).values({
        conversationId: input.conversationId,
        role: "assistant",
        content: responseText,
        tokensUsed: responseText.split(" ").length,
      });

      await db.update(aiConversations)
        .set({ updatedAt: new Date() })
        .where(eq(aiConversations.id, input.conversationId));

      return { response: responseText };
    }),

  deleteConversation: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const existing = await db.query.aiConversations.findFirst({
        where: and(eq(aiConversations.id, input.id), eq(aiConversations.tenantId, ctx.user!.tenantId as number)),
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      }
      await db.delete(aiMessages).where(eq(aiMessages.conversationId, input.id));
      await db.delete(aiConversations).where(eq(aiConversations.id, input.id));
      return { success: true };
    }),
});
