const ChatDesktopHeader = () => {
  return (
    <header className="bg-primary text-primary-content hidden md:flex">
      <div className="w-[90%] mx-auto flex justify-between items-center py-3">
        <div className="flex gap-3">
          <h2 className="text-xl">New Chat</h2>
        </div>
      </div>
    </header>
  );
};

export default ChatDesktopHeader;
