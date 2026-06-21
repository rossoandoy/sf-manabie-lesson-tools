# Master Catalog SOQL

Generated for trg2-extuat baseline. Re-run `npm run discover` after org schema changes.

```sql
-- locations
SELECT Id, Name, MANAERP__Location_Type__c, MANAERP__Status__c, MANAERP__Academic_Calendar__c
FROM Account
WHERE MANAERP__Location_Type__c = 'Center' AND MANAERP__Status__c = 'Operating'
ORDER BY Name

-- academicYears
SELECT Id, Name FROM MANAERP__Academic_Year__c ORDER BY Name DESC

-- locationCourses
SELECT Id, Name, MANAERP__Account__c, MANAERP__Course_Offering__c
FROM MANAERP__Location_Course__c ORDER BY Name

-- classes
SELECT Id, Name, MANAERP__Location_Course__c FROM MANAERP__Class__c ORDER BY Name

-- classrooms
SELECT Id, Name, MANAERP__Account__c FROM MANAERP__Classroom__c ORDER BY Name

-- teachers
SELECT Id, Name FROM Contact WHERE RecordType.Name = 'Staff' ORDER BY Name

-- academicCalendars
SELECT Id, Name FROM MANAERP__Academic_Calendar__c ORDER BY Name
```
