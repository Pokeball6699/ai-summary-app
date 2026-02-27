'use client'
import { useState } from "react";
import { supabase } from '@/lib/supabase';

export default function Home() {
  const [status, setStatus] = useState("Frontend running");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  async function checkBackend() {
    setStatus("Checking backend...");
    const res = await fetch('/api/health');
    const data = await res.json();
    setStatus(`Backend says: ${data.message}`);
  }
  const handleUpload = async () => {
  if (!selectedFile) {
    alert('choose your document');
    return;
  }
setUploadStatus('uploading...');
try {
  // set a unique file name
  const fileExt = selectedFile.name.split('.').pop() || 'file';
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

  const { data, error } = await supabase.storage
      .from('test')
      .upload(fileName, selectedFile, {
        cacheControl: '3600',  // 1 hours
        upsert: false,         // no cover the same name file
      });

    if (error) throw error;

    setUploadStatus(`upload sucessfully${data.path}`);
    setSelectedFile(null); //
  } catch (err: any) {
    console.error('fail:', err);
    setUploadStatus('fail:' + (err.message || 'unknown error'));
  }
};

  return (
    <div style={{ fontFamily: "system-ui", padding: 24, maxWidth: 800 }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem', color: '#1d324b' }}>AI Summary App</h1>
      <button 
        onClick={checkBackend}
        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded"
      >
        Check backend
      </button>
      <p style={{ marginTop: 12 }}>{status}</p>

      <button
  onClick={async () => {
    const { data, error } = await supabase.from('test').select('*').limit(1);
    console.log('Supabase test:', data, error);
  }}
>
  Test Supabase Connection
</button>
<div className="mt-8 p-6 bg-white rounded-lg shadow-md max-w-md mx-auto">
  <h2 className="text-xl font-semibold mb-4 text-center">upload document</h2>

  <input
    type="file"
    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
    className="mb-4 block w-full text-sm text-gray-500
      file:mr-4 file:py-2 file:px-4
      file:rounded-full file:border-0
      file:text-sm file:font-semibold
      file:bg-blue-50 file:text-blue-700
      hover:file:bg-blue-100"
  />

  <button
    onClick={handleUpload}
    disabled={!selectedFile}
    className="w-full bg-blue-600 text-white py-2 px-4 rounded
      hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
  >
    upload to Supabase
  </button>

  {uploadStatus && (
    <p className={`mt-4 text-center ${uploadStatus.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
      {uploadStatus}
    </p>
  )}
</div>


    </div>
    




  );

  
}