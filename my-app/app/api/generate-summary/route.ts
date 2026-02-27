import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createClient } from '@supabase/supabase-js';


const execAsync = promisify(exec);

// server-side Supabase client (requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null;


export async function POST(req: NextRequest) {
  try {
    const { fileText, customPrompt, fileName } = await req.json();

    if (!fileText) {
      return NextResponse.json({ error: 'No file content provided' }, { status: 400 });
    }

    const prompt = customPrompt.trim()
      ? `${customPrompt}\n\nContent:\n${fileText.slice(0, 30000)}`
      : `Summarize this document in Japanese, use a lot of emojis, and divide it into exactly 3 sections:\n\n${fileText.slice(0, 30000)}`;

    try {
// Check if llm is available and has models configured
      const { stdout: modelsOutput } = await execAsync('llm models -j 2>&1', { timeout: 5000 });
      
      if (!modelsOutput || modelsOutput.trim().length === 0) {
        console.warn('No llm models available, returning dummy summary');
        const dummySummary = `📝 **Summary** 📝\n\n1️⃣ **Main Points**: ${fileText.slice(0, 100)}...\n\n2️⃣ **Key Details**: Content contains important information.\n\n3️⃣ **Conclusion**: Please configure llm with a model API key.`;
        return NextResponse.json({
          summary: dummySummary,
          modelInfo: 'Demo mode - llm not configured'
        });
      }

      // call llm
      const { stdout, stderr } = await execAsync(`llm "${prompt.replace(/"/g, '\\"')}"`, { timeout: 30000 });

      if (stderr) {
        console.error('llm stderr:', stderr);
      }

      const generatedSummary = stdout.trim() || 'Failed to generate summary from llm';

      // persist to Postgres (if configured)
      if (supabaseAdmin) {
        try {
          // upsert document record by name (requires unique constraint on name)
          const docPayload: any = { name: fileName || null };
          const { data: docData, error: docErr } = await supabaseAdmin
            .from('documents')
            .upsert(docPayload, { onConflict: 'name' })
            .select('id')
            .limit(1)
            .single();

          const documentId = docData?.id || null;

          if (documentId) {
            await supabaseAdmin.from('summaries').insert([{ document_id: documentId, summary: generatedSummary, model_info: 'llm CLI' }]);
          }
        } catch (dbErr) {
          console.error('Failed to persist summary to Postgres:', dbErr);
        }
      }

      return NextResponse.json({
        summary: generatedSummary,
        modelInfo: 'Generated with llm CLI'
      });
    } catch (llmError: any) {
      console.error('LLM execution error:', llmError);
      
      // Return a demo summary if llm fails
      const demoSummary = `📝 **Summary** 📝\n\n1️⃣ **Section 1**: The document discusses important topics related to the content provided.\n\n2️⃣ **Section 2**: Key information and details are presented throughout.\n\n3️⃣ **Section 3**: Further analysis and conclusions based on the material.\n\n⚠️ Note: This is a demo summary. To enable AI summaries, configure the 'llm' CLI tool with your API credentials.`;
      return NextResponse.json({
        summary: demoSummary,
        modelInfo: 'Demo mode (configure llm CLI for real AI summaries)'
      });
    }
  } catch (error: any) {
    console.error('Generate summary error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to generate summary',
      details: 'Ensure the Next.js server is running and accessible'
    }, { status: 500 });
  }
}