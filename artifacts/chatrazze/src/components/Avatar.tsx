interface Props {
  name: string;
  photoURL?: string | null;
  size?: number;
  className?: string;
}

export default function Avatar({ name, photoURL, size = 40, className = "" }: Props) {
  const initial = (name || "?").charAt(0).toUpperCase();
  const style = { width: size, height: size, fontSize: size * 0.4 };
  if (photoURL) {
    return (
      <img
        src={photoURL}
        alt={name}
        style={style}
        className={`rounded-full object-cover bg-white/5 ${className}`}
      />
    );
  }
  return (
    <div
      style={style}
      className={`rounded-full bg-gradient-to-br from-accent to-secondary flex items-center justify-center font-semibold text-white ${className}`}
    >
      {initial}
    </div>
  );
}
