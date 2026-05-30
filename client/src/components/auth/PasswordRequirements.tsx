interface PasswordRequirementsProps {
  messages: string[];
}

export default function PasswordRequirements({ messages }: PasswordRequirementsProps) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <ul className="mt-2 list-disc pl-5 text-sm text-red-600 space-y-1">
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
}
