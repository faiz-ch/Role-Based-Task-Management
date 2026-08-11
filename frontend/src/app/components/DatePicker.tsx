import React, { useState } from "react";
import { Calendar as CalendarIcon, Clock, X } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "./ui/utils";

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
}

export function DatePicker({
  value,
  onChange,
  label,
  min,
  max,
  disabled = false,
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [timeValue, setTimeValue] = useState("");

  // Parse the datetime-local value to Date object
  const parseDate = (dateString: string): Date | null => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
  };

  // Format Date object to datetime-local string
  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const selectedDate = parseDate(value);
  const minDate = min ? parseDate(min) : undefined;
  const maxDate = max ? parseDate(max) : undefined;

  // Initialize time value when date changes
  React.useEffect(() => {
    if (selectedDate) {
      const hours = String(selectedDate.getHours()).padStart(2, "0");
      const minutes = String(selectedDate.getMinutes()).padStart(2, "0");
      setTimeValue(`${hours}:${minutes}`);
    }
  }, [value]);

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;

    // Combine selected date with existing time or default to 00:00
    const hours = timeValue ? parseInt(timeValue.split(":")[0]) : 0;
    const minutes = timeValue ? parseInt(timeValue.split(":")[1]) : 0;
    
    const newDate = new Date(date);
    newDate.setHours(hours, minutes, 0, 0);
    
    onChange(formatDate(newDate));
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTimeValue = e.target.value;
    setTimeValue(newTimeValue);
    
    if (selectedDate) {
      const hours = parseInt(newTimeValue.split(":")[0]) || 0;
      const minutes = parseInt(newTimeValue.split(":")[1]) || 0;
      
      const newDate = new Date(selectedDate);
      newDate.setHours(hours, minutes, 0, 0);
      
      onChange(formatDate(newDate));
    }
  };

  const handleClear = () => {
    onChange("");
    setTimeValue("");
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label className="block text-xs font-medium text-muted-foreground">
          {label}
        </label>
      )}
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              className={cn(
                "flex-1 flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed",
                !selectedDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="w-4 h-4" />
              {selectedDate ? (
                <span className="flex-1 text-left">
                  {format(selectedDate, "MMM d, yyyy")}
                </span>
              ) : (
                <span className="flex-1 text-left">Select date</span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate || undefined}
              onSelect={handleDateSelect}
              disabled={(date) => {
                if (disabled) return true;
                if (minDate && date < minDate) return true;
                if (maxDate && date > maxDate) return true;
                return false;
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        
        <div className="relative flex items-center">
          <Clock className="absolute left-3 w-4 h-4 text-muted-foreground" />
          <input
            type="time"
            disabled={disabled || !selectedDate}
            value={timeValue}
            onChange={handleTimeChange}
            className="pl-9 pr-8 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {value && (
            <button
              type="button"
              onClick={handleClear}
              disabled={disabled}
              className="absolute right-2 p-1 text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
