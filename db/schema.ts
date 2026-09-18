import { sqliteTable, text, integer, primaryKey, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
export const users = sqliteTable('users', {
  id: text('id').primaryKey(), name: text('name').notNull(), createdAt: integer('created_at').notNull(),
});
export const rooms = sqliteTable('rooms', {
  id: text('id').primaryKey(), kind: text('kind', {enum:['channel','dm']}).notNull(),
  name: text('name').notNull(), topic: text('topic').notNull().default(''),
  pairKey: text('pair_key'), creator: text('creator').notNull().references(()=>users.id),
  createdAt: integer('created_at').notNull(),
}, t => [uniqueIndex('rooms_pair').on(t.pairKey)]);
export const members = sqliteTable('members', {
  roomId: text('room_id').notNull().references(()=>rooms.id), userId: text('user_id').notNull().references(()=>users.id),
}, t => [primaryKey({columns:[t.roomId,t.userId]}),index('members_user').on(t.userId,t.roomId)]);
export const messages = sqliteTable('messages', {
  seq: integer('seq').primaryKey({autoIncrement:true}), id: text('id').notNull().unique(),
  roomId: text('room_id').notNull().references(()=>rooms.id), senderId: text('sender_id').notNull().references(()=>users.id),
  clientId: text('client_id').notNull(), body: text('body').notNull(), createdAt: integer('created_at').notNull(),
}, t => [uniqueIndex('messages_sender_client').on(t.senderId,t.clientId),index('messages_room_seq').on(t.roomId,t.seq)]);
