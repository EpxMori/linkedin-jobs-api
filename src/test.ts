import { query, IQueryOptions } from "./index";

const queryOptions: IQueryOptions = {
  location: "India",
  dateSincePosted: "1hr",
  limit: "1",
  sortBy: "recent",
  page: "0",
};

query(queryOptions).then((response) => {
  console.log(response);
});
