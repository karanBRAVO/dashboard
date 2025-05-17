import Form from "@rjsf/core";
import validator from "@rjsf/validator-ajv8";
import { job_schema } from "./schema";
import axios from "axios";
import { useEffect, useState } from "react";

const log = (type) => console.log.bind(console, type);

const JobSchema = () => {
    const [editableJob, setEditableJob] = useState(null);

    const fetchJobData = async () => {
        try {
            const response = await axios.get(`api/jobs/default/job-c`);
            if (response.status === 200) {
                const job = response.data;
                const ej = {
                    metadata: {
                        name: job.metadata.name,
                        namespace: job.metadata.namespace,
                    },
                    spec: job.spec,
                };
                setEditableJob(ej);
            }
        } catch (err) {
            console.error("Error fetching job data:", err);
        }
    };

    useEffect(() => {
        fetchJobData();
    }, []);

    return (
        <div>
            <Form
                schema={job_schema}
                formData={editableJob}
                validator={validator}
                onChange={log("changed")}
                onSubmit={log("submitted")}
                onError={log("errors")}
            />
        </div>
    );
};

export default JobSchema;
