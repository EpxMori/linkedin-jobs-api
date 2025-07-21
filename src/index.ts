import cheerio from "cheerio";
import axios from "axios";
import randomUseragent from "random-useragent";

// Interfaces
interface IQueryOptions {
  host?: string;
  keyword?: string;
  location?: string;
  dateSincePosted?: 'past month' | 'past week' | '24hr' | '1hr' | '';
  jobType?: 'full time' | 'part time' | 'contract' | 'temporary' | 'volunteer' | 'internship' | '';
  remoteFilter?: 'on-site' | 'remote' | 'hybrid' | '';
  salary?: '40000' | '60000' | '80000' | '100000' | '120000' | '';
  experienceLevel?: 'internship' | 'entry level' | 'associate' | 'senior' | 'director' | 'executive' | '';
  sortBy?: 'recent' | 'relevant' | '';
  limit?: string;
  page?: string;
  logger?: boolean;
}

interface IJob {
  position: string;
  company: string;
  location: string;
  date: string;
  salary: string;
  jobUrl: string;
  companyLogo: string;
  agoTime: string;
}

// Utility functions
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

class Query {
  private host: string;
  private keyword: string;
  private location: string;
  private dateSincePosted: IQueryOptions['dateSincePosted'];
  private jobType: IQueryOptions['jobType'];
  private remoteFilter: IQueryOptions['remoteFilter'];
  private salary: IQueryOptions['salary'];
  private experienceLevel: IQueryOptions['experienceLevel'];
  private sortBy: IQueryOptions['sortBy'];
  private limit: string;
  private page: string;
  private logger: boolean;

  private readonly pageUrl: string;
  private readonly jobsUrl: string;

  constructor(queryObj: IQueryOptions) {
    this.host = queryObj.host || "www.linkedin.com";
    this.keyword = queryObj.keyword?.trim() || "" ;
    this.location = queryObj.location?.trim() || "";
    this.dateSincePosted = queryObj.dateSincePosted || "";
    this.jobType = queryObj.jobType || "";
    this.remoteFilter = queryObj.remoteFilter || "";
    this.salary = queryObj.salary || "";
    this.experienceLevel = queryObj.experienceLevel || "";
    this.sortBy = queryObj.sortBy || "";
    this.limit = queryObj.limit || "";
    this.page = queryObj.page || "";
    this.logger = queryObj.logger || false;

    this.pageUrl = `https://${this.host}/jobs/search`;
    this.jobsUrl = `https://${this.host}/jobs-guest/jobs/api/seeMoreJobPostings/search`;
  }

  private getDateSincePosted(): string {
    if (!this.dateSincePosted) return "";
    const dateRange = {
      "past month": "r2592000",
      "past week": "r604800",
      "24hr": "r86400",
      "1hr": "r3600",
    };
    return dateRange[this.dateSincePosted] || "";
  }

  private getExperienceLevel(): string {
    if (!this.experienceLevel) return "";
    const experienceRange = {
      internship: "1",
      "entry level": "2",
      associate: "3",
      senior: "4",
      director: "5",
      executive: "6",
    };
    return experienceRange[this.experienceLevel] || "";
  }

  private getJobType(): string {
    if (!this.jobType) return "";
    const jobTypeRange = {
      "full time": "F",
      "part time": "P",
      contract: "C",
      temporary: "T",
      volunteer: "V",
      internship: "I",
    };
    return jobTypeRange[this.jobType] || "";
  }

  private sortJobsByAgoTime(jobs: IJob[]): IJob[] {
    function convertToMinutes(timeStr: string): number {
      timeStr = timeStr.toLowerCase();

      if (timeStr.includes("just now")) return 0;

      const [numStr, unit] = timeStr.split(" ");
      const num = parseInt(numStr, 10);

      if (unit.includes("hour")) return num * 60;
      if (unit.includes("minute")) return num;

      return Infinity; // fallback for unsupported formats
    }

    return [...jobs].sort((a, b) => {
      return convertToMinutes(a.agoTime) - convertToMinutes(b.agoTime);
    });
  }

  private getRemoteFilter(): string {
    if (!this.remoteFilter) return "";
    const remoteFilterRange = {
      "on-site": "1",
      remote: "2",
      hybrid: "3",
    };
    return remoteFilterRange[this.remoteFilter] || "";
  }

  private getSalary(): string {
    if (!this.salary) return "";
    const salaryRange = {
      40000: "1",
      60000: "2",
      80000: "3",
      100000: "4",
      120000: "5",
    };
    return salaryRange[this.salary] || "";
  }

  private getPage(): number {
    return Number(this.page) * 25;
  }

  private getSearchPageUrl(): string {
    const params = new URLSearchParams();
    
    if (this.keyword) params.append("keywords", this.keyword);
    if (this.location) params.append("location", this.location);
    if (this.getDateSincePosted().length > 0) params.append("f_TPR", this.getDateSincePosted());
    if (this.getSalary().length > 0) params.append("f_SB2", this.getSalary());
    if (this.getExperienceLevel().length > 0) params.append("f_E", this.getExperienceLevel());
    if (this.getRemoteFilter().length > 0) params.append("f_WT", this.getRemoteFilter());
    if (this.getJobType().length > 0) params.append("f_JT", this.getJobType());
    params.append("position", "1");
    params.append("pageNum", "0");
    if (this.sortBy === "relevant") params.append("sortBy", "R");

    return `${this.pageUrl}?${params.toString()}`;
  }

  private getUrl(start: number): string {
    const params = new URLSearchParams();

    if (this.keyword) params.append("keywords", this.keyword);
    if (this.location) params.append("location", this.location);
    if (this.getDateSincePosted().length > 0) params.append("f_TPR", this.getDateSincePosted());
    if (this.getSalary().length > 0) params.append("f_SB2", this.getSalary());
    if (this.getExperienceLevel().length > 0) params.append("f_E", this.getExperienceLevel());
    if (this.getRemoteFilter().length > 0) params.append("f_WT", this.getRemoteFilter());
    if (this.getJobType().length > 0) params.append("f_JT", this.getJobType());
    params.append("start", (start + this.getPage()).toString());
    if (this.sortBy === "relevant") params.append("sortBy", "R");

    return `${this.jobsUrl}?${params.toString()}`;
  }

  private async getTotalPages(): Promise<number> {
    const headers = {
      "User-Agent": randomUseragent.getRandom()!,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Connection": "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
    };

    try {
      const url = this.getSearchPageUrl();
      this.logger && console.log("Fetching search page:", url);
      
      const response = await axios.get<string>(url, {
        headers,
        timeout: 15000,
      });

      const $ = cheerio.load(response.data);
      
      let jobsCountText = $('.results-context-header__job-count').text().trim();
      if (!jobsCountText) {
        jobsCountText = $('[data-test="results-context-header-job-count"]').text().trim();
      }
      if (!jobsCountText) {
        jobsCountText = $('.jobs-search-results-list__subtitle').text().trim();
      }

      this.logger && console.log("Jobs count text:", jobsCountText);

      const jobsCount = parseInt(jobsCountText.replace(/[^\d]/g, '') || '0', 10);
      const totalPages = Math.max(1, Math.ceil(jobsCount / 25));

      this.logger && console.log(`Found ${jobsCount} jobs, ${totalPages} pages`);
      
      return Math.min(totalPages, 40);
    } catch (error: any) {
      console.warn("Error getting total pages, falling back to pagination:", error.message);
      return 40;
    }
  }

  private async fetchJobBatch(start: number): Promise<IJob[]> {
    const headers = {
        "User-Agent": randomUseragent.getRandom()!,
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": this.getSearchPageUrl(),
        "X-Requested-With": "XMLHttpRequest",
        "Connection": "keep-alive",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
    };

    try {
        const response = await axios.get<string>(this.getUrl(start), {
            headers,
            timeout: 10000,
        });
        return this.parseJobList(response.data);
    } catch (error: any) {
        if (error && error.isAxiosError && error.response?.status === 429) {
            throw new Error("Rate limit reached");
        }
        throw error;
    }
  }

  private parseJobList(jobData: string): IJob[] {
    try {
        const $ = cheerio.load(jobData);
        const jobs = $("li");

        return jobs
            .map((_, element): IJob | null => {
                try {
                    const job = $(element);
                    const position = job.find(".base-search-card__title").text().trim();
                    const company = job.find(".base-search-card__subtitle").text().trim();
                    const location = job.find(".job-search-card__location").text().trim();
                    const date = job.find("time").attr("datetime") || "";
                    const salary = job.find(".job-search-card__salary-info").text().trim().replace(/\s+/g, " ");
                    
                    let jobUrl = job.find(".base-card__full-link").attr("href") || "";
                    if (!jobUrl) {
                        jobUrl = job.find("a").attr("href") || "";
                    }
                    if (jobUrl) {
                        jobUrl = jobUrl.split('?')[0];
                    }
                    
                    const companyLogo = job.find(".artdeco-entity-image").attr("data-delayed-url") || "";
                    const agoTime = job.find(".job-search-card__listdate--new").text().trim() || 
                                   job.find(".job-search-card__listdate").text().trim() || "";

                    if (!position || !company) return null;

                    return {
                        position,
                        company,
                        location,
                        date,
                        salary: salary || "Not specified",
                        jobUrl,
                        companyLogo,
                        agoTime,
                    };
                } catch (err: any) {
                    console.warn(`Error parsing job:`, err.message);
                    return null;
                }
            })
            .get()
            .filter((job): job is IJob => job !== null);
    } catch (error: any) {
        console.error("Error parsing job list:", error);
        return [];
    }
  }

  public async getJobs(): Promise<IJob[]> {
    let allJobs: IJob[] = [];
    let start = 0;
    const BATCH_SIZE = 25;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 3;

    try {
        // Always fetch fresh data - no cache check
        this.logger && console.log("Fetching fresh job data...");

        const totalPages = await this.getTotalPages();
        console.log(`Planning to fetch up to ${totalPages} pages`);

        let currentPage = 0;
        while (currentPage < totalPages) {
            try {
                const jobs = await this.fetchJobBatch(start);

                if (!jobs || jobs.length === 0) {
                    console.log("No more jobs found, stopping pagination");
                    break;
                }

                allJobs.push(...jobs);
                console.log(`Fetched ${jobs.length} jobs from page ${currentPage + 1}/${totalPages}. Total: ${allJobs.length}`);

                if (this.sortBy === "recent") allJobs = this.sortJobsByAgoTime(allJobs);

                if (this.limit && allJobs.length >= Number(this.limit)) {
                    allJobs = allJobs.slice(0, Number(this.limit));
                    console.log(`Reached limit of ${this.limit} jobs`);
                    break;
                }

                consecutiveErrors = 0;
                currentPage++;
                start += BATCH_SIZE;

                // Add delay between requests to be respectful
                await delay(2000 + Math.random() * 1000);
            } catch (error: any) {
                consecutiveErrors++;
                console.error(`Error fetching page ${currentPage + 1} (attempt ${consecutiveErrors}):`, error.message);
                if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                    console.log("Max consecutive errors reached. Stopping.");
                    break;
                }
                // Exponential backoff
                await delay(Math.pow(2, consecutiveErrors) * 1000);
            }
        }

        console.log(`Final result: ${allJobs.length} fresh jobs fetched`);
        return allJobs;
    } catch (error: any) {
        console.error("Fatal error in job fetching:", error);
        throw error;
    }
  }
}

// Main query function
const query = (queryObject: IQueryOptions): Promise<IJob[]> => {
  const query = new Query(queryObject);
  return query.getJobs();
};

export {
    query,
    IQueryOptions,
    IJob
};