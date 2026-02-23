import Image from "next/image";

interface BrowserFrameProps {
  imageSrc: string;
  imageAlt: string;
}

export function BrowserFrame({ imageSrc, imageAlt }: BrowserFrameProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-950 shadow-2xl">
      <div className="flex items-center gap-2 border-b border-gray-800 bg-gray-900 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-red-500" />
        <span className="h-3 w-3 rounded-full bg-yellow-500" />
        <span className="h-3 w-3 rounded-full bg-green-500" />
      </div>
      <Image
        src={imageSrc}
        alt={imageAlt}
        width={1920}
        height={1080}
        className="w-full"
        priority
      />
    </div>
  );
}
