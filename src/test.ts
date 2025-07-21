import { query, IQueryOptions } from "./index";

const queryOptions: IQueryOptions = {
  location: "Philippines",
  dateSincePosted: "24hr",
  limit: "30",
  sortBy: "recent",
  page: "0",
  keyword: "Back End Developer",
  logger: true,
};

query(queryOptions).then((response) => {
  console.log(response);
});
