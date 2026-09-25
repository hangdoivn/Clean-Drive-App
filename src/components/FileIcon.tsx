import { File, FileArchive, FileImage, FileText, FileVideo, Folder } from 'lucide-react';

export function FileIcon({ mimeType }: { mimeType: string }) {
  let Icon = File;
  let className = 'file-icon file-icon--default';

  if (mimeType === 'application/vnd.google-apps.folder') {
    Icon = Folder;
    className = 'file-icon file-icon--folder';
  } else if (mimeType.includes('video')) {
    Icon = FileVideo;
    className = 'file-icon file-icon--video';
  } else if (mimeType.includes('image') || mimeType.includes('photoshop')) {
    Icon = FileImage;
    className = 'file-icon file-icon--image';
  } else if (mimeType.includes('zip') || mimeType.includes('archive')) {
    Icon = FileArchive;
    className = 'file-icon file-icon--archive';
  } else if (mimeType.includes('document') || mimeType.includes('pdf')) {
    Icon = FileText;
    className = 'file-icon file-icon--document';
  }

  return <span className={className}><Icon size={19} /></span>;
}
