'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Progress } from '../ui/progress';
import { 
  Upload, 
  File, 
  Image, 
  Video, 
  Paperclip, 
  X, 
  Download,
  Eye,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { AttachmentType, MessageAttachment } from '../../types/communication';
import { supabase } from '../../lib/supabase/client';
import { useAuth } from '../../contexts/auth-context';
import toast from 'react-hot-toast';

interface FileUploadProps {
  onFilesUploaded: (attachments: MessageAttachment[]) => void;
  maxFiles?: number;
  maxFileSize?: number; // in MB
  allowedTypes?: string[];
  className?: string;
}

interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  error?: string;
  attachment?: MessageAttachment;
}

export function FileUpload({ 
  onFilesUploaded, 
  maxFiles = 5, 
  maxFileSize = 10,
  allowedTypes = ['image/*', 'video/*', 'audio/*', 'application/pdf', '.doc', '.docx', '.txt'],
  className 
}: FileUploadProps) {
  const { user } = useAuth();
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files || !user) return;

    const filesArray = Array.from(files);
    
    // Validate file count
    if (filesArray.length + uploadingFiles.length > maxFiles) {
      toast.error(`Maximum ${maxFiles} files allowed`);
      return;
    }

    // Validate each file
    const validFiles: File[] = [];
    for (const file of filesArray) {
      // Check file size
      if (file.size > maxFileSize * 1024 * 1024) {
        toast.error(`${file.name} is too large. Maximum size is ${maxFileSize}MB`);
        continue;
      }

      // Check file type
      const isValidType = allowedTypes.some(type => {
        if (type.includes('*')) {
          return file.type.startsWith(type.replace('*', ''));
        } else if (type.startsWith('.')) {
          return file.name.toLowerCase().endsWith(type.toLowerCase());
        } else {
          return file.type === type;
        }
      });

      if (!isValidType) {
        toast.error(`${file.name} is not a supported file type`);
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    // Start uploading valid files
    const newUploadingFiles: UploadingFile[] = validFiles.map(file => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      progress: 0,
      status: 'uploading'
    }));

    setUploadingFiles(prev => [...prev, ...newUploadingFiles]);
    
    // Upload each file
    newUploadingFiles.forEach(uploadingFile => {
      uploadFile(uploadingFile);
    });
  }, [user, maxFiles, maxFileSize, allowedTypes, uploadingFiles.length]);

  const uploadFile = async (uploadingFile: UploadingFile) => {
    try {
      const fileExt = uploadingFile.file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random()}.${fileExt}`;
      const filePath = `${user?.league_id}/attachments/${fileName}`;

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('message-attachments')
        .upload(filePath, uploadingFile.file, {
          onUploadProgress: (progress) => {
            const percent = (progress.loaded / progress.total) * 100;
            setUploadingFiles(prev => prev.map(f => 
              f.id === uploadingFile.id 
                ? { ...f, progress: percent }
                : f
            ));
          }
        });

      if (error) throw error;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('message-attachments')
        .getPublicUrl(filePath);

      // Create attachment record
      const attachment: Omit<MessageAttachment, 'id' | 'message_id'> = {
        filename: fileName,
        original_filename: uploadingFile.file.name,
        file_url: urlData.publicUrl,
        file_size: uploadingFile.file.size,
        mime_type: uploadingFile.file.type,
        type: getAttachmentType(uploadingFile.file.type),
        thumbnail_url: await generateThumbnail(uploadingFile.file),
        uploaded_at: new Date().toISOString()
      };

      // Update uploading file status
      setUploadingFiles(prev => prev.map(f => 
        f.id === uploadingFile.id 
          ? { 
              ...f, 
              status: 'completed', 
              progress: 100,
              attachment: attachment as MessageAttachment
            }
          : f
      ));

    } catch (error) {
      console.error('Upload error:', error);
      setUploadingFiles(prev => prev.map(f => 
        f.id === uploadingFile.id 
          ? { 
              ...f, 
              status: 'error', 
              error: error instanceof Error ? error.message : 'Upload failed'
            }
          : f
      ));
      toast.error(`Failed to upload ${uploadingFile.file.name}`);
    }
  };

  const generateThumbnail = async (file: File): Promise<string | undefined> => {
    if (!file.type.startsWith('image/')) return undefined;

    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        const MAX_SIZE = 200;
        let { width, height } = img;

        if (width > height) {
          if (width > MAX_SIZE) {
            height = (height * MAX_SIZE) / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = (width * MAX_SIZE) / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx?.drawImage(img, 0, 0, width, height);
        
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };

      img.onerror = () => resolve(undefined);
      img.src = URL.createObjectURL(file);
    });
  };

  const getAttachmentType = (mimeType: string): AttachmentType => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) {
      return 'document';
    }
    return 'other';
  };

  const removeUploadingFile = (id: string) => {
    setUploadingFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleSendAttachments = () => {
    const completedAttachments = uploadingFiles
      .filter(f => f.status === 'completed' && f.attachment)
      .map(f => f.attachment!);
    
    if (completedAttachments.length > 0) {
      onFilesUploaded(completedAttachments);
      setUploadingFiles([]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const getFileIcon = (type: AttachmentType) => {
    switch (type) {
      case 'image':
        return <Image className="h-5 w-5" />;
      case 'video':
        return <Video className="h-5 w-5" />;
      case 'document':
        return <File className="h-5 w-5" />;
      default:
        return <Paperclip className="h-5 w-5" />;
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const hasCompletedUploads = uploadingFiles.some(f => f.status === 'completed');
  const hasUploadingFiles = uploadingFiles.some(f => f.status === 'uploading');

  return (
    <div className={className}>
      {/* Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          isDragOver 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
        <p className="text-lg font-medium text-gray-900 mb-2">
          Drop files here or click to browse
        </p>
        <p className="text-sm text-gray-500 mb-4">
          Maximum {maxFiles} files, {maxFileSize}MB each
        </p>
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingFiles.length >= maxFiles}
        >
          <Paperclip className="h-4 w-4 mr-2" />
          Choose Files
        </Button>
        
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={allowedTypes.join(',')}
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
        />
      </div>

      {/* Uploading Files List */}
      {uploadingFiles.length > 0 && (
        <div className="mt-4 space-y-2">
          <h4 className="text-sm font-medium text-gray-900">
            Files ({uploadingFiles.length}/{maxFiles})
          </h4>
          
          {uploadingFiles.map((uploadingFile) => (
            <Card key={uploadingFile.id}>
              <CardContent className="p-3">
                <div className="flex items-center space-x-3">
                  {/* File Icon/Thumbnail */}
                  <div className="flex-shrink-0">
                    {uploadingFile.attachment?.thumbnail_url ? (
                      <img
                        src={uploadingFile.attachment.thumbnail_url}
                        alt="Thumbnail"
                        className="h-10 w-10 rounded object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 bg-gray-100 rounded flex items-center justify-center">
                        {getFileIcon(getAttachmentType(uploadingFile.file.type))}
                      </div>
                    )}
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {uploadingFile.file.name}
                      </p>
                      <div className="flex items-center space-x-2">
                        {uploadingFile.status === 'completed' && (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        )}
                        {uploadingFile.status === 'error' && (
                          <AlertCircle className="h-4 w-4 text-red-600" />
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeUploadingFile(uploadingFile.id)}
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-gray-500">
                        {formatFileSize(uploadingFile.file.size)}
                      </p>
                      {uploadingFile.status === 'error' && (
                        <p className="text-xs text-red-600">
                          {uploadingFile.error}
                        </p>
                      )}
                    </div>
                    
                    {/* Progress Bar */}
                    {uploadingFile.status === 'uploading' && (
                      <Progress 
                        value={uploadingFile.progress} 
                        className="mt-2 h-1"
                      />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Send Button */}
          {hasCompletedUploads && (
            <div className="flex justify-end mt-4">
              <Button
                onClick={handleSendAttachments}
                disabled={hasUploadingFiles}
              >
                <Upload className="h-4 w-4 mr-2" />
                Send Files ({uploadingFiles.filter(f => f.status === 'completed').length})
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Component for displaying message attachments
interface MessageAttachmentsProps {
  attachments: MessageAttachment[];
  compact?: boolean;
  className?: string;
}

export function MessageAttachments({ attachments, compact = false, className }: MessageAttachmentsProps) {
  const getFileIcon = (type: AttachmentType) => {
    switch (type) {
      case 'image':
        return <Image className="h-4 w-4" />;
      case 'video':
        return <Video className="h-4 w-4" />;
      case 'document':
        return <File className="h-4 w-4" />;
      default:
        return <Paperclip className="h-4 w-4" />;
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleDownload = (attachment: MessageAttachment) => {
    const link = document.createElement('a');
    link.href = attachment.file_url;
    link.download = attachment.original_filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePreview = (attachment: MessageAttachment) => {
    if (attachment.type === 'image') {
      window.open(attachment.file_url, '_blank');
    } else {
      handleDownload(attachment);
    }
  };

  if (compact) {
    return (
      <div className={`flex flex-wrap gap-2 ${className}`}>
        {attachments.map((attachment) => (
          <div
            key={attachment.id}
            className="flex items-center space-x-2 bg-gray-100 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-200 transition-colors"
            onClick={() => handlePreview(attachment)}
          >
            {getFileIcon(attachment.type)}
            <span className="text-sm font-medium truncate max-w-32">
              {attachment.original_filename}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {attachments.map((attachment) => (
        <Card key={attachment.id} className="hover:bg-gray-50 transition-colors">
          <CardContent className="p-3">
            <div className="flex items-center space-x-3">
              {/* Thumbnail or Icon */}
              <div className="flex-shrink-0">
                {attachment.thumbnail_url ? (
                  <img
                    src={attachment.thumbnail_url}
                    alt="Thumbnail"
                    className="h-12 w-12 rounded object-cover cursor-pointer"
                    onClick={() => handlePreview(attachment)}
                  />
                ) : (
                  <div className="h-12 w-12 bg-gray-100 rounded flex items-center justify-center">
                    {getFileIcon(attachment.type)}
                  </div>
                )}
              </div>

              {/* File Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {attachment.original_filename}
                </p>
                <div className="flex items-center space-x-2 mt-1">
                  <p className="text-xs text-gray-500">
                    {formatFileSize(attachment.file_size || 0)}
                  </p>
                  <span className="text-xs text-gray-300">•</span>
                  <p className="text-xs text-gray-500 uppercase">
                    {attachment.type}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center space-x-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePreview(attachment)}
                  className="h-8 w-8 p-0"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownload(attachment)}
                  className="h-8 w-8 p-0"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}