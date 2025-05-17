import { Handle, Position } from "@xyflow/react";

const CustomNode = ({ data, borderColor, handleBg, textColor, bgColor }) => {
    return (
        <div
            style={{
                background: bgColor,
                border: `2px solid ${data.selected ? "#000" : borderColor}`,
                padding: "10px 15px",
                borderRadius: "8px",
                minWidth: "120px",
                textAlign: "center",
                position: "relative",
                fontFamily: "monospace",
                cursor: "pointer",
            }}
            title={data.label}
        >
            <Handle
                type="target"
                position={Position.Top}
                style={{ background: handleBg }}
            />
            <span
                style={{
                    position: "absolute",
                    top: "-10px",
                    right: "5px",
                    background: "#ffffff",
                    borderRadius: "3px",
                    color: "#000",
                    fontSize: "10px",
                    padding: "2px 4px",
                    border: `1px solid ${borderColor}`,
                }}
            >
                {data.type}
            </span>
            <span
                style={{
                    color: textColor,
                }}
            >
                {data.label}
            </span>
            <Handle
                type="source"
                position={Position.Bottom}
                style={{ background: handleBg }}
            />
        </div>
    );
};

export const QueueNode = ({ data }) => {
    return (
        <CustomNode
            data={data}
            borderColor={"#007acc"}
            handleBg={"#007acc"}
            bgColor={"#e0f7ff"}
            textColor={"#004a75"}
        />
    );
};

export const JobNode = ({ data }) => {
    return (
        <CustomNode
            data={data}
            borderColor={"#28a745"}
            handleBg={"#28a745"}
            bgColor={"#eaffea"}
            textColor={"#145a32"}
        />
    );
};

export const TaskNode = ({ data }) => {
    return (
        <CustomNode
            data={data}
            borderColor={"#ff9800"}
            handleBg={"#ff9800"}
            bgColor={"#fff3e0"}
            textColor={"#e65100"}
        />
    );
};

export const PodNode = ({ data }) => {
    return (
        <CustomNode
            data={data}
            borderColor={"#f44336"}
            handleBg={"#f44336"}
            bgColor={"#ffebee"}
            textColor={"#b71c1c"}
        />
    );
};
