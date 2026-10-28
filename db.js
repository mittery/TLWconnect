// ==========================================
// TLW Connect — Supabase Database Service
// ==========================================
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Load .env automatically if running in Node.js with local .env file
if (fs.existsSync('.env')) {
  try {
    process.loadEnvFile('.env');
  } catch (err) {
    // Ignore if already loaded or in production
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL &&
  SUPABASE_KEY &&
  SUPABASE_URL.startsWith('https://') &&
  !SUPABASE_URL.includes('your-project-id')
);

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  : null;

// ================= TEST CONNECTION =================
export async function testConnection() {
  if (!supabase) {
    console.warn('[DB] Supabase is not configured. Falling back to local in-memory storage.');
    return false;
  }
  try {
    const { data, error } = await supabase.from('users').select('count', { count: 'exact', head: true });
    if (error) {
      console.error('[DB] Supabase connection test error:', error.message);
      return false;
    }
    console.log('✅ [DB] Successfully connected to Supabase Database!');
    return true;
  } catch (err) {
    console.error('[DB] Supabase connection exception:', err.message);
    return false;
  }
}

// ================= USERS =================
export async function dbGetUsers() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.from('users').select('*');
    if (error) throw error;
    return (data || []).map(u => ({
      id: u.id,
      fullName: u.full_name,
      studentId: u.student_id,
      idCardHash: u.id_card_hash,
      idCardMasked: u.id_card_masked,
      token: u.token,
      createdAt: Number(u.created_at),
      lastLogin: Number(u.last_login)
    }));
  } catch (err) {
    console.error('[DB] Failed to get users from Supabase:', err.message);
    return [];
  }
}

export async function dbInsertUser(user) {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('users').insert({
      id: user.id,
      full_name: user.fullName,
      student_id: user.studentId,
      id_card_hash: user.idCardHash,
      id_card_masked: user.idCardMasked,
      token: user.token,
      created_at: user.createdAt,
      last_login: user.lastLogin
    });
    if (error) throw error;
  } catch (err) {
    console.error('[DB] Failed to insert user to Supabase:', err.message);
  }
}

export async function dbUpdateUserLastLogin(token, lastLogin) {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from('users')
      .update({ last_login: lastLogin })
      .eq('token', token);
    if (error) throw error;
  } catch (err) {
    console.error('[DB] Failed to update user last login in Supabase:', err.message);
  }
}

// ================= POSTS & COMMENTS =================
export async function dbGetPosts() {
  if (!supabase) return null;
  try {
    const [postsRes, commentsRes] = await Promise.all([
      supabase.from('posts').select('*').order('timestamp', { ascending: false }),
      supabase.from('comments').select('*').order('timestamp', { ascending: true })
    ]);

    if (postsRes.error) throw postsRes.error;
    if (commentsRes.error) throw commentsRes.error;

    const commentsMap = new Map();
    (commentsRes.data || []).forEach(c => {
      if (!commentsMap.has(c.post_id)) commentsMap.set(c.post_id, []);
      commentsMap.get(c.post_id).push({
        id: c.id,
        author: {
          name: c.author_name,
          badge: c.author_badge,
          color: c.author_color,
          role: c.author_role,
          official: c.author_official
        },
        content: c.content,
        timestamp: Number(c.timestamp)
      });
    });

    return (postsRes.data || []).map(p => ({
      id: p.id,
      channel: p.channel,
      author: {
        name: p.author_name,
        badge: p.author_badge,
        color: p.author_color,
        role: p.author_role,
        official: p.author_official
      },
      authorKey: p.author_key,
      authorInternal: {
        studentId: p.student_id,
        userId: p.user_id
      },
      title: p.title,
      content: p.content,
      tags: Array.isArray(p.tags) ? p.tags : [],
      timestamp: Number(p.timestamp),
      upvotes: p.upvotes || 0,
      downvotes: p.downvotes || 0,
      reactions: p.reactions || { '🔥': 0, '💀': 0, '💡': 0, '🤫': 0, '❤️': 0 },
      comments: commentsMap.get(p.id) || [],
      status: p.status || undefined,
      officialResponse: p.official_response || undefined,
      statusUpdatedAt: p.status_updated_at ? Number(p.status_updated_at) : undefined,
      editedAt: p.edited_at ? Number(p.edited_at) : undefined
    }));
  } catch (err) {
    console.error('[DB] Failed to get posts from Supabase:', err.message);
    return null;
  }
}

export async function dbInsertPost(post) {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('posts').insert({
      id: post.id,
      channel: post.channel,
      author_name: post.author?.name || 'Anon',
      author_badge: post.author?.badge || '👤',
      author_color: post.author?.color || '#a855f7',
      author_role: post.author?.role || 'student',
      author_official: !!post.author?.official,
      author_key: post.authorKey || null,
      student_id: post.authorInternal?.studentId || null,
      user_id: post.authorInternal?.userId || null,
      title: post.title,
      content: post.content,
      tags: post.tags || [],
      timestamp: post.timestamp,
      upvotes: post.upvotes || 0,
      downvotes: post.downvotes || 0,
      reactions: post.reactions || {},
      status: post.status || null,
      official_response: post.officialResponse || null,
      status_updated_at: post.statusUpdatedAt || null,
      edited_at: post.editedAt || null
    });
    if (error) throw error;
  } catch (err) {
    console.error('[DB] Failed to insert post to Supabase:', err.message);
  }
}

export async function dbUpdatePost(post) {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from('posts')
      .update({
        title: post.title,
        content: post.content,
        channel: post.channel,
        tags: post.tags || [],
        edited_at: post.editedAt
      })
      .eq('id', post.id);
    if (error) throw error;
  } catch (err) {
    console.error('[DB] Failed to update post in Supabase:', err.message);
  }
}

export async function dbDeletePost(postId) {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('posts').delete().eq('id', postId);
    if (error) throw error;
  } catch (err) {
    console.error('[DB] Failed to delete post from Supabase:', err.message);
  }
}

export async function dbUpdatePostVotes(postId, upvotes, downvotes) {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from('posts')
      .update({ upvotes, downvotes })
      .eq('id', postId);
    if (error) throw error;
  } catch (err) {
    console.error('[DB] Failed to update post votes in Supabase:', err.message);
  }
}

export async function dbUpdatePostReactions(postId, reactions) {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from('posts')
      .update({ reactions })
      .eq('id', postId);
    if (error) throw error;
  } catch (err) {
    console.error('[DB] Failed to update post reactions in Supabase:', err.message);
  }
}

export async function dbUpdatePostStatus(postId, status, officialResponse, statusUpdatedAt) {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from('posts')
      .update({
        status,
        official_response: officialResponse,
        status_updated_at: statusUpdatedAt
      })
      .eq('id', postId);
    if (error) throw error;
  } catch (err) {
    console.error('[DB] Failed to update post status in Supabase:', err.message);
  }
}

// ================= COMMENTS =================
export async function dbInsertComment(postId, comment) {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('comments').insert({
      id: comment.id,
      post_id: postId,
      author_name: comment.author?.name || 'Anon',
      author_badge: comment.author?.badge || '💬',
      author_color: comment.author?.color || '#06b6d4',
      author_role: comment.author?.role || 'student',
      author_official: !!comment.author?.official,
      content: comment.content,
      timestamp: comment.timestamp
    });
    if (error) throw error;
  } catch (err) {
    console.error('[DB] Failed to insert comment to Supabase:', err.message);
  }
}

export async function dbDeleteComment(commentId) {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('comments').delete().eq('id', commentId);
    if (error) throw error;
  } catch (err) {
    console.error('[DB] Failed to delete comment from Supabase:', err.message);
  }
}

// ================= REPORTS =================
export async function dbGetReports() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.from('reports').select('*').order('timestamp', { ascending: false });
    if (error) throw error;
    return (data || []).map(r => ({
      id: r.id,
      postId: r.post_id,
      postTitle: r.post_title,
      postAuthor: r.post_author,
      postChannel: r.post_channel,
      postContent: r.post_content,
      reason: r.reason,
      details: r.details,
      reporterName: r.reporter_name,
      timestamp: Number(r.timestamp),
      status: r.status,
      resolvedAction: r.resolved_action,
      resolvedAt: r.resolved_at ? Number(r.resolved_at) : undefined
    }));
  } catch (err) {
    console.error('[DB] Failed to get reports from Supabase:', err.message);
    return [];
  }
}

export async function dbInsertReport(report) {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('reports').insert({
      id: report.id,
      post_id: report.postId,
      post_title: report.postTitle,
      post_author: report.postAuthor,
      post_channel: report.postChannel,
      post_content: report.postContent,
      reason: report.reason,
      details: report.details,
      reporter_name: report.reporterName,
      timestamp: report.timestamp,
      status: report.status || 'pending',
      resolved_action: report.resolvedAction || null,
      resolved_at: report.resolvedAt || null
    });
    if (error) throw error;
  } catch (err) {
    console.error('[DB] Failed to insert report to Supabase:', err.message);
  }
}

export async function dbUpdateReport(reportId, status, resolvedAction, resolvedAt) {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from('reports')
      .update({
        status,
        resolved_action: resolvedAction,
        resolved_at: resolvedAt
      })
      .eq('id', reportId);
    if (error) throw error;
  } catch (err) {
    console.error('[DB] Failed to update report in Supabase:', err.message);
  }
}

// ================= BANNED USERS =================
export async function dbGetBannedUsers() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.from('banned_users').select('*');
    if (error) throw error;
    return (data || []).map(b => ({
      id: b.id,
      name: b.name,
      studentId: b.student_id,
      userId: b.user_id,
      reason: b.reason,
      bannedAt: Number(b.banned_at)
    }));
  } catch (err) {
    console.error('[DB] Failed to get banned users from Supabase:', err.message);
    return [];
  }
}

export async function dbInsertBannedUser(ban) {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('banned_users').insert({
      name: ban.name || null,
      student_id: ban.studentId || null,
      user_id: ban.userId || null,
      reason: ban.reason || null,
      banned_at: ban.bannedAt || Date.now()
    });
    if (error) throw error;
  } catch (err) {
    console.error('[DB] Failed to insert banned user to Supabase:', err.message);
  }
}

export async function dbDeleteBannedUser({ authorName, studentId }) {
  if (!supabase) return;
  try {
    let query = supabase.from('banned_users').delete();
    if (authorName && studentId) {
      query = query.or(`name.eq.${authorName},student_id.eq.${studentId}`);
    } else if (authorName) {
      query = query.eq('name', authorName);
    } else if (studentId) {
      query = query.eq('student_id', studentId);
    }
    const { error } = await query;
    if (error) throw error;
  } catch (err) {
    console.error('[DB] Failed to delete banned user from Supabase:', err.message);
  }
}

// ================= SHOUTS =================
export async function dbGetShouts(limit = 50) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('shouts')
      .select('*')
      .order('time', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).reverse().map(s => ({
      id: s.id,
      author: s.author,
      badge: s.badge,
      color: s.color,
      text: s.text,
      time: Number(s.time)
    }));
  } catch (err) {
    console.error('[DB] Failed to get shouts from Supabase:', err.message);
    return [];
  }
}

export async function dbInsertShout(shout) {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('shouts').insert({
      id: shout.id,
      author: shout.author,
      badge: shout.badge,
      color: shout.color,
      text: shout.text,
      time: shout.time
    });
    if (error) throw error;
  } catch (err) {
    console.error('[DB] Failed to insert shout to Supabase:', err.message);
  }
}

// ================= AUDIT LOGS =================
export async function dbGetAuditLogs(limit = 100) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map(l => ({
      id: l.id,
      action: l.action,
      detail: l.detail,
      timestamp: Number(l.timestamp)
    }));
  } catch (err) {
    console.error('[DB] Failed to get audit logs from Supabase:', err.message);
    return [];
  }
}

export async function dbInsertAuditLog(log) {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('audit_logs').insert({
      id: log.id,
      action: log.action,
      detail: log.detail,
      timestamp: log.timestamp
    });
    if (error) throw error;
  } catch (err) {
    console.error('[DB] Failed to insert audit log to Supabase:', err.message);
  }
}
