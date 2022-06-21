import { Button } from "ui";
// import { prisma, User } from "@project/prisma";
import { tryMe } from "@project/constants";

export default function Web({ users }: { users: User[] }) {
  return (
    <div>
      <h1>Web</h1>
      <Button />
      <p>
        This is a constant that comes from the "@project/constants" package:{" "}
        {tryMe}
      </p>
      <p>Here are all the users currently in your database.</p>
      <pre>{JSON.stringify(users, null, 2)}</pre>
    </div>
  );
}

// export const getStaticProps = async () => {
//   const users = await prisma.user.findMany();

//   return {
//     props: {
//       users,
//     },
//   };
// };
