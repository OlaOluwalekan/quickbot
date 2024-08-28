import { SessionProps } from "@/types/user";
import BasicButton from "../ui/button/BasicButton";

const TokensDisplay = ({ user }: { user: SessionProps }) => {
  return (
    <div>
      <div className="flex flex-col justify-center items-center gap-2">
        <h3 className="text-3xl bg-success/30 text-success px-5 py-1 rounded">
          {user.token}
        </h3>
        <p className="text-center text-xs text-secondary-content max-w-[400px]">
          You have <span>{user.token}</span> tokens left. You can click the
          button below to request for more token ONLY after you are out of token
        </p>
        <BasicButton
          type="button"
          text="Request Token"
          size="medium"
          disabled={user.token > 0}
          title={
            user.token > 0
              ? `Yo have ${user.token} tokens. You can only request token after you are out of token`
              : ""
          }
        />
      </div>
    </div>
  );
};

export default TokensDisplay;
