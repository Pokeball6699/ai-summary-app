'use client'

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

export default function Home() {
  // ── Backend health check state ────────────────────────────────
  const [status, setStatus] = useState("Frontend running");

  // ── Upload state ──────────────────────────────────────────────
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>('');

  // ── File list state ───────────────────────────────────────────
  const [files, setFiles] = useState<any[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // ── Selected document & tabs ──────────────────────────────────
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'pdf' | 'text' | 'summary'>('summary');

  // ── AI Summary state ──────────────────────────────────────────
  const [summary, setSummary] = useState<string>('');
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [summaryModelInfo, setSummaryModelInfo] = useState('');

  // ── Settings modal state ──────────────────────────────────────
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState(
    "summarize in japanese. use a lot of emoji. there should be 3 sections"
  );
  const defaultPrompt = "summarize in japanese. use a lot of emoji. there should be 3 sections";

  // Load files from bucket
  const loadFiles = async () => {
    setLoadingFiles(true);
    try {
      const { data, error } = await supabase.storage.from('test').list();

      if (error) throw error;

      setFiles(data || []);
    } catch (err: any) {
      console.error('Failed to load files:', err);
      setUploadStatus('Failed to load files: ' + err.message);
    } finally {
      setLoadingFiles(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  // Check backend health
  async function checkBackend() {
    setStatus("Checking backend...");
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setStatus(`Backend says: ${data.message}`);
    } catch {
      setStatus('Failed to check backend');
    }
  }

  // Upload file
  const handleUpload = async () => {
    if (!selectedFile) {
      alert('Please choose your document first');
      return;
    }

    setUploadStatus('Uploading...');

    try {
      const fileExt = selectedFile.name.split('.').pop() || 'file';
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from('test')
        .upload(fileName, selectedFile, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) throw error;

      setUploadStatus(`Upload successful! Path: ${data.path}`);
      setSelectedFile(null);
      loadFiles(); // Refresh list
    } catch (err: any) {
      console.error('Upload failed:', err);
      setUploadStatus('Upload failed: ' + (err.message || 'unknown error'));
    }
  };

  // Delete file
  const handleDelete = async (fileName: string) => {
    if (!confirm(`Are you sure you want to delete ${fileName}?`)) return;

    try {
      const { error } = await supabase.storage.from('test').remove([fileName]);

      if (error) throw error;

      setUploadStatus(`Deleted: ${fileName}`);
      loadFiles();
      if (selectedDoc?.name === fileName) setSelectedDoc(null);
    } catch (err: any) {
      setUploadStatus('Delete failed: ' + err.message);
    }
  };

  // Select file → show right side
  const handleSelectFile = (file: any) => {
    setSelectedDoc(file);
    setActiveTab('summary');
    setSummary('');
    setSummaryModelInfo('');
  };

  // Generate AI summary using GitHub Models via llm CLI (backend API route)
  const handleGenerateSummary = async () => {
    if (!selectedDoc) {
      alert('Please select a document first');
      return;
    }

    setGeneratingSummary(true);
    setSummary('Generating summary...');
    setSummaryModelInfo('');

    try {
      // Download file content from Supabase
      const { data: fileBlob, error: dlError } = await supabase.storage
        .from('test')
        .download(selectedDoc.name);

      if (dlError) throw dlError;

      const fileNameLower = selectedDoc.name.toLowerCase();
      let fileText = '';

      // Extract text based on file type
      if (fileNameLower.endsWith('.pdf')) {
        const arrayBuffer = await fileBlob.arrayBuffer();
        const pdf = new PDFParse({ data: arrayBuffer });
        const pdfData = await pdf.getText();
        fileText = pdfData.text;
      } else if (fileNameLower.endsWith('.docx') || fileNameLower.endsWith('.doc')) {
        const arrayBuffer = await fileBlob.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        fileText = result.value;
      } else if (fileNameLower.endsWith('.xlsx') || fileNameLower.endsWith('.xls')) {
        const arrayBuffer = await fileBlob.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        let text = '';
        workbook.SheetNames.forEach(sheetName => {
          const sheet = workbook.Sheets[sheetName];
          text += XLSX.utils.sheet_to_txt(sheet) + '\n\n';
        });
        fileText = text;
      } else if (fileNameLower.endsWith('.txt') || fileNameLower.endsWith('.md')) {
        fileText = await fileBlob.text();
      } else {
        throw new Error('Unsupported file format. Currently only .pdf, .docx, .xlsx, .txt, .md are supported.');
      }

      // Limit text length to avoid token limits
      const limitedText = fileText.slice(0, 30000);

      const response = await fetch('/api/generate-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileText: limitedText,
          customPrompt: customPrompt.trim() || defaultPrompt,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to generate summary');
      }

      const result = await response.json();

      setSummary(result.summary);
      setSummaryModelInfo(result.modelInfo || 'Generated with gpt-4o-mini');
    } catch (err: any) {
      console.error('Generate summary error:', err);
      setSummary('Failed to generate summary: ' + err.message);
    } finally {
      setGeneratingSummary(false);
    }
  };

  // Settings handlers
  const handleResetDefault = () => {
    setCustomPrompt(defaultPrompt);
  };

  const handleSaveSettings = () => {
    alert('Settings saved!\nCustom prompt:\n' + customPrompt);
    setIsSettingsOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-800">AI Summary App</h1>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded-lg transition"
          >
            ⚙️ Settings
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Upload + Stored Files */}
          <div className="space-y-6">
            {/* Upload */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">Upload Document:</h2>
              <div className="flex items-center gap-4 mb-4">
                <label className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded cursor-pointer">
                  Choose File
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  />
                </label>
                <span className="text-gray-600">
                  {selectedFile ? selectedFile.name : 'No file chosen'}
                </span>
              </div>

              <button
                onClick={handleUpload}
                disabled={!selectedFile}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Upload
              </button>

              {uploadStatus && (
                <p className={`mt-4 text-center font-medium ${uploadStatus.includes('successful') ? 'text-green-600' : 'text-red-600'}`}>
                  {uploadStatus}
                </p>
              )}
            </div>

            {/* Stored Files */}
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Stored Files</h2>
                <button
                  onClick={loadFiles}
                  disabled={loadingFiles}
                  className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded disabled:opacity-50"
                >
                  Refresh
                </button>
              </div>

              {loadingFiles ? (
                <p className="text-center text-gray-500 py-8">Loading...</p>
              ) : files.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No files uploaded yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          File Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Size (KB)
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {files.map((file) => (
                        <tr key={file.name} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 cursor-pointer" onClick={() => handleSelectFile(file)}>
                            {file.name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {Math.round((file.metadata?.size || 0) / 1024)} KB
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm flex gap-2">
                            <button
                              onClick={() => handleSelectFile(file)}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
                            >
                              Generate Summary
                            </button>
                            <button
                              onClick={() => handleDelete(file.name)}
                              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Right side: Document viewer & summary */}
          <div className="bg-white p-6 rounded-lg shadow">
            {selectedDoc ? (
              <>
                <h2 className="text-xl font-semibold mb-4">
                  Document: {selectedDoc.name}
                </h2>

                {/* Tabs */}
                <div className="flex border-b mb-6 overflow-x-auto">
                  <button
                    onClick={() => setActiveTab('pdf')}
                    className={`px-5 py-3 font-medium whitespace-nowrap ${
                      activeTab === 'pdf' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    PDF Viewer
                  </button>
                  <button
                    onClick={() => setActiveTab('text')}
                    className={`px-5 py-3 font-medium whitespace-nowrap ${
                      activeTab === 'text' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Extracted Text
                  </button>
                  <button
                    onClick={() => setActiveTab('summary')}
                    className={`px-5 py-3 font-medium whitespace-nowrap ${
                      activeTab === 'summary' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Summary
                  </button>
                </div>

                {/* Tab content */}
                {activeTab === 'pdf' && (
                  <div className="h-96 bg-gray-100 rounded flex items-center justify-center">
                    <p className="text-gray-500">PDF Viewer (add pdf.js integration later)</p>
                  </div>
                )}

                {activeTab === 'text' && (
                  <div className="h-96 overflow-auto p-4 bg-gray-50 rounded">
                    <p className="text-gray-700">Extracted text will appear here (add PDF parsing later)</p>
                  </div>
                )}

                {activeTab === 'summary' && (
                  <div>
                    <div className="flex gap-3 mb-6">
                      <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded flex items-center gap-2">
                        ✏️ Edit
                      </button>
                      <button
                        onClick={handleGenerateSummary}
                        disabled={generatingSummary || !selectedDoc}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded flex items-center gap-2 disabled:opacity-50"
                      >
                        {generatingSummary ? 'Generating...' : '🔄 Regenerate Summary'}
                      </button>
                    </div>

                    {generatingSummary ? (
                      <p className="text-center text-gray-500 py-8">Generating summary...</p>
                    ) : summary ? (
                      <div className="p-5 bg-green-50 rounded-lg border border-green-200">
                        {summaryModelInfo && (
                          <p className="text-sm text-gray-500 mb-3">{summaryModelInfo}</p>
                        )}
                        <div className="prose text-gray-800 whitespace-pre-wrap">
                          {summary}
                        </div>
                      </div>
                    ) : (
                      <p className="text-center text-gray-500 py-8">
                        Click "Regenerate Summary" to generate AI summary
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-500 py-20">
                <p className="text-xl mb-3">Select a document</p>
                <p className="text-center">Choose a file from the left to view its content and generate summaries</p>
              </div>
            )}
          </div>
        </div>

        {/* Settings Modal */}
        {isSettingsOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
                  <button
                    onClick={() => setIsSettingsOpen(false)}
                    className="text-gray-600 hover:text-gray-800 text-3xl leading-none"
                  >
                    ×
                  </button>
                </div>

                <h3 className="text-xl font-semibold mb-4">AI Summary Customization</h3>
                <p className="text-gray-600 mb-4">
                  Customize the prompt that will be sent to the AI when generating summaries. Add your specific
                  requirements or instructions below. Leave empty to use the default prompt.
                </p>

                <label className="block text-gray-700 font-medium mb-2">Custom Requirements</label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  rows={6}
                  className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none font-mono text-sm"
                  placeholder="summarize in japanese. use a lot of emoji. there should be 3 sections"
                />

                <p className="text-sm text-gray-500 mt-3 italic">
                  Tip: The AI will incorporate your requirements into the summary generation process.
                  <br />
                  Default prompt focuses on creating a comprehensive summary with key points and main ideas.
                </p>

                <div className="flex justify-end gap-4 mt-8">
                  <button
                    onClick={handleResetDefault}
                    className="px-5 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition"
                  >
                    Reset to Default
                  </button>
                  <button
                    onClick={() => setIsSettingsOpen(false)}
                    className="px-5 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveSettings}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium"
                  >
                    Save Settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}