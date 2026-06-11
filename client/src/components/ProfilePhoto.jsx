import React from "react";
import { UserRound } from "lucide-react";

export function ProfilePhotoFrame({ student, className = "" }) {
  const appearanceClasses = (student?.appearance?.classes || []).filter((name) => String(name).startsWith("ap-avatar-")).join(" ");
  return <div className={`profile-picture-wrap ${appearanceClasses} ${className}`}>
    <div className="profile-picture-frame">
      {student?.profilePhoto ? <img src={student.profilePhoto} alt={`${student.name || "Student"} profile`} /> : <UserRound size={42} />}
    </div>
  </div>;
}

export async function fileToProfilePhoto(file) {
  if (!file) return "";
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const bitmap = await loadImage(file);
  const maxSide = 420;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.78);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this image."));
    };
    image.src = url;
  });
}
