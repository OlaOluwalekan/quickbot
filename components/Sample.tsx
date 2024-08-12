import { formatDate } from "@/utils/date-format";
import { marked } from "marked";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { FaUserCircle } from "react-icons/fa";
import { FaRobot } from "react-icons/fa6";
import htmlParser from "html-react-parser";
import ChatMD from "./ChatMD";

interface chatProps {
  question: string;
  response: string;
  createdAt: string;
}

const markdownToHTML = (markdown: string) => {
  return marked(markdown);
};

const Chat = ({ question, response, createdAt }: chatProps) => {
  const session = useSession();
  const dateCreatedObj = formatDate(createdAt);
  const dateNowObj = formatDate(new Date().toISOString());
  let dateCreated = `${dateCreatedObj.month} ${dateCreatedObj.date} ${dateCreatedObj.year} at ${dateCreatedObj.time}`;

  const htmlContent = markdownToHTML(response);

  // console.log(htmlContent)

  if (
    dateCreatedObj.date === dateNowObj.date &&
    dateCreatedObj.month === dateNowObj.month &&
    dateCreatedObj.year === dateNowObj.year
  ) {
    dateCreated = `Today at ${dateCreatedObj.time}`;
  }

  if (
    dateCreatedObj.month === dateNowObj.month &&
    dateCreatedObj.year === dateNowObj.year
  ) {
    if (dateNowObj.date - dateCreatedObj.date === 1) {
      dateCreated = `Yesterday at ${dateCreatedObj.time}`;
    } else if (
      dateNowObj.date - dateCreatedObj.date >= 2 &&
      dateNowObj.date - dateCreatedObj.date <= 6
    ) {
      dateCreated = `${dateNowObj.date - dateCreatedObj.date} days ago at ${
        dateCreatedObj.time
      }`;
    }
  }
  // formatDate(new Date().toISOString())

  // console.log(dateNowObj.date - dateCreatedObj.date)

  return (
    <div>
      <div className="chat chat-end">
        <div className="chat-image avatar">
          <div className="w-10 rounded-full">
            {session.data?.user?.image ? (
              <Image
                src={session.data.user.image}
                alt="photo"
                width={30}
                height={30}
              />
            ) : (
              <span className="flex justify-center items-center w-10 h-10 rounded-full">
                <FaUserCircle className="text-[30px]" />
              </span>
            )}
          </div>
        </div>
        <div className="chat-header">
          You
          <time className="text-xs opacity-50 ml-2">{dateCreated}</time>
        </div>
        <div className="chat-bubble chat-bubble-primary">{question}</div>
        <div className="chat-footer opacity-50">Delivered</div>
      </div>
      <div className="chat chat-start">
        <div className="chat-image avatar">
          <div className="w-10 rounded-full flex justify-center items-center">
            <FaRobot className="text-4xl" />
          </div>
        </div>
        <div className="chat-header">
          Quickbot
          <time className="text-xs opacity-50 ml-2">{dateCreated}</time>
        </div>
        <div className="markdown chat-bubble chat-bubble-secondary min-w-[300px] whitespace-pre-wrap break-words">
          <ChatMD response={response} />
        </div>
        <div className="chat-footer opacity-50">Seen at 12:46</div>
      </div>
    </div>
  );
};

export default Chat;
